"""Native macOS window that shows text and highlights the word being spoken."""
from bisect import bisect_right
from dataclasses import dataclass

import objc

from AppKit import (
    NSApplication,
    NSApplicationActivationPolicyRegular,
    NSBackgroundColorAttributeName,
    NSBackingStoreBuffered,
    NSBezelStyleRounded,
    NSBoldFontMask,
    NSButton,
    NSColor,
    NSFont,
    NSFontAttributeName,
    NSFloatingWindowLevel,
    NSFontManager,
    NSForegroundColorAttributeName,
    NSItalicFontMask,
    NSMakeRange,
    NSMakeRect,
    NSMaxRange,
    NSMutableParagraphStyle,
    NSParagraphStyleAttributeName,
    NSScrollView,
    NSSegmentedControl,
    NSSegmentSwitchTrackingSelectOne,
    NSTextAlignmentRight,
    NSTextView,
    NSUnderlineStyleAttributeName,
    NSUnderlineStyleSingle,
    NSWindow,
    NSWritingDirectionRightToLeft,
    NSWindowStyleMaskClosable,
    NSWindowStyleMaskResizable,
    NSWindowStyleMaskTitled,
)
from AVFoundation import AVAudioPlayer
from Foundation import NSURL, NSObject, NSTimer

TICK_SECONDS = 0.03
SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0]  # AVAudioPlayer supports 0.5-2.0
SEEK_MARGIN = 0.02  # seconds
BAR_HEIGHT = 40
BASE_SIZE = 20
HEADING_SIZES = {"h1": 32, "h2": 26, "h3": 22}
BLOCK_KINDS = {"h1", "h2", "h3", "h4", "h5", "h6", "list", "quote", "codeblock"}


@dataclass
class Word:
    start: float  # seconds into the audio
    begin: int  # character range in the displayed text
    end: int


@dataclass
class Style:
    begin: int
    end: int
    kind: str  # bold, italic, code, link, or a block kind from BLOCK_KINDS


class _Controller(NSObject):
    """App delegate and target of the bar's controls."""

    paused = False

    def applicationShouldTerminateAfterLastWindowClosed_(self, app):
        return True

    @objc.IBAction
    def speedChanged_(self, sender):
        self.player.setRate_(SPEEDS[sender.selectedSegment()])

    @objc.IBAction
    def togglePause_(self, sender):
        self.toggle_pause()

    @objc.python_method
    def toggle_pause(self):
        if self.paused:
            self.player.play()
        else:
            self.player.pause()
        self.paused = not self.paused
        self.pause_button.setTitle_("Resume" if self.paused else "Pause")


class _ReaderView(NSTextView):
    """Text view that reports plain clicks (to seek) and the space bar (to pause)."""

    on_click = None  # called with the clicked UTF-16 character index
    on_space = None

    def mouseDown_(self, event):
        point = self.convertPoint_fromView_(event.locationInWindow(), None)
        # The default handler tracks the mouse until release, so a drag still selects.
        objc.super(_ReaderView, self).mouseDown_(event)
        if self.selectedRange().length == 0 and self.on_click:
            self.on_click(self.characterIndexForInsertionAtPoint_(point))

    def keyDown_(self, event):
        if event.characters() == " " and self.on_space:
            self.on_space()
        else:
            objc.super(_ReaderView, self).keyDown_(event)


def _utf16_offsets(text: str) -> list[int]:
    """Map each Python string index to its offset in NSString's UTF-16 units."""
    offsets = [0]
    for ch in text:
        offsets.append(offsets[-1] + (2 if ord(ch) > 0xFFFF else 1))
    return offsets


def _paragraph_style(indent: float = 0, hanging: float = 0, rtl: bool = False) -> NSMutableParagraphStyle:
    p = NSMutableParagraphStyle.alloc().init()
    if rtl:
        p.setBaseWritingDirection_(NSWritingDirectionRightToLeft)
        p.setAlignment_(NSTextAlignmentRight)
    p.setParagraphSpacing_(12)
    p.setLineHeightMultiple_(1.15)
    p.setFirstLineHeadIndent_(indent)
    p.setHeadIndent_(indent + hanging)
    return p


def _apply_styles(storage, text: str, styles: list[Style], u: list[int], rtl: bool = False) -> None:
    fm = NSFontManager.sharedFontManager()
    whole = NSMakeRange(0, u[len(text)])
    storage.addAttribute_value_range_(
        NSFontAttributeName, NSFont.systemFontOfSize_(BASE_SIZE), whole
    )
    storage.addAttribute_value_range_(NSParagraphStyleAttributeName, _paragraph_style(rtl=rtl), whole)

    # Block styles first so inline styles can build on their fonts.
    for s in sorted(styles, key=lambda s: s.kind not in BLOCK_KINDS):
        r = NSMakeRange(u[s.begin], u[s.end] - u[s.begin])
        if s.kind in HEADING_SIZES or s.kind in ("h4", "h5", "h6"):
            size = HEADING_SIZES.get(s.kind, BASE_SIZE)
            storage.addAttribute_value_range_(
                NSFontAttributeName, NSFont.boldSystemFontOfSize_(size), r
            )
        elif s.kind == "codeblock":
            font = NSFont.monospacedSystemFontOfSize_weight_(BASE_SIZE - 3, 0.0)
            storage.addAttribute_value_range_(NSFontAttributeName, font, r)
        elif s.kind == "list":
            storage.addAttribute_value_range_(
                NSParagraphStyleAttributeName, _paragraph_style(hanging=22, rtl=rtl), r
            )
        elif s.kind == "quote":
            storage.addAttribute_value_range_(
                NSParagraphStyleAttributeName, _paragraph_style(indent=20, rtl=rtl), r
            )
            _convert_fonts(storage, fm, r, NSItalicFontMask)
        elif s.kind == "bold":
            _convert_fonts(storage, fm, r, NSBoldFontMask)
        elif s.kind == "italic":
            _convert_fonts(storage, fm, r, NSItalicFontMask)
        elif s.kind == "code":
            font = NSFont.monospacedSystemFontOfSize_weight_(BASE_SIZE - 2, 0.0)
            storage.addAttribute_value_range_(NSFontAttributeName, font, r)
        elif s.kind == "link":
            storage.addAttribute_value_range_(
                NSUnderlineStyleAttributeName, NSUnderlineStyleSingle, r
            )


def _convert_fonts(storage, fm, r, trait) -> None:
    """Add a font trait run by run, so overlapping styles (bold + italic) combine."""
    loc = r.location
    end = NSMaxRange(r)
    while loc < end:
        font, run = storage.attribute_atIndex_longestEffectiveRange_inRange_(
            NSFontAttributeName, loc, None, NSMakeRange(loc, end - loc)
        )
        storage.addAttribute_value_range_(
            NSFontAttributeName, fm.convertFont_toHaveTrait_(font, trait), run
        )
        loc = NSMaxRange(run)


def seek_index(begins: list[int], index: int) -> int | None:
    """Word index containing or preceding UTF-16 offset `index`, or None when there are no timed words."""
    return max(bisect_right(begins, index) - 1, 0) if begins else None


def show_and_play(text: str, words: list[Word], styles: list[Style], wav_path: str, rtl: bool = False) -> None:
    """Open the window, play wav_path, and highlight words in sync.

    rtl lays the text out right to left, right-aligned (Arabic).
    Blocks until playback finishes or the window is closed.
    """
    app = NSApplication.sharedApplication()
    app.setActivationPolicy_(NSApplicationActivationPolicyRegular)
    controller = _Controller.alloc().init()
    app.setDelegate_(controller)

    style = NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskResizable
    window = NSWindow.alloc().initWithContentRect_styleMask_backing_defer_(
        NSMakeRect(0, 0, 720, 480), style, NSBackingStoreBuffered, False
    )
    window.setTitle_("narrate-mlx")
    window.center()
    window.setReleasedWhenClosed_(False)

    content = window.contentView()
    bounds = content.bounds()
    scroll_frame = NSMakeRect(0, BAR_HEIGHT, bounds.size.width, bounds.size.height - BAR_HEIGHT)
    scroll = NSScrollView.alloc().initWithFrame_(scroll_frame)
    scroll.setHasVerticalScroller_(True)
    scroll.setAutoresizingMask_(2 | 16)  # width + height sizable
    view = _ReaderView.alloc().initWithFrame_(scroll.contentView().bounds())
    view.setEditable_(False)
    view.setSelectable_(True)
    view.setTextContainerInset_((16, 16))
    view.setAutoresizingMask_(2)
    view.setString_(text)
    scroll.setDocumentView_(view)
    content.addSubview_(scroll)

    speed = NSSegmentedControl.alloc().initWithFrame_(
        NSMakeRect((bounds.size.width - 300) / 2, 8, 300, 24)
    )
    speed.setSegmentCount_(len(SPEEDS))
    for i, s in enumerate(SPEEDS):
        speed.setLabel_forSegment_(f"{s:g}×", i)
    speed.setTrackingMode_(NSSegmentSwitchTrackingSelectOne)
    speed.setSelectedSegment_(SPEEDS.index(1.0))
    speed.setAutoresizingMask_(1 | 4)  # stay centered horizontally
    speed.setTarget_(controller)
    speed.setAction_("speedChanged:")
    content.addSubview_(speed)

    pause = NSButton.alloc().initWithFrame_(NSMakeRect(16, 6, 90, 28))
    pause.setTitle_("Pause")
    pause.setBezelStyle_(NSBezelStyleRounded)
    pause.setTarget_(controller)
    pause.setAction_("togglePause:")
    content.addSubview_(pause)
    controller.pause_button = pause

    storage = view.textStorage()
    u = _utf16_offsets(text)
    _apply_styles(storage, text, styles, u, rtl)

    starts = [w.start for w in words]
    state = {"current": None}

    def word_range(w: Word):
        return NSMakeRange(u[w.begin], u[w.end] - u[w.begin])

    # Follow the player's own playback position (in audio time, so it stays in
    # sync at any rate) rather than a wall clock.
    player, error = AVAudioPlayer.alloc().initWithContentsOfURL_error_(
        NSURL.fileURLWithPath_(wav_path), None
    )
    if player is None:
        raise RuntimeError(f"cannot play {wav_path}: {error}")
    player.setEnableRate_(True)  # must be set before playing; keeps pitch constant
    player.prepareToPlay()
    controller.player = player
    player.play()

    begins = [u[w.begin] for w in words]

    def seek_to_word(index: int) -> None:
        i = seek_index(begins, index)
        if i is None:
            return
        # Land just inside the word: the player rounds to whole audio frames, and
        # landing just before would highlight the previous word for a tick.
        player.setCurrentTime_(words[i].start + SEEK_MARGIN)

    view.on_click = seek_to_word
    view.on_space = controller.toggle_pause
    window.makeFirstResponder_(view)

    def tick(_timer):
        if not player.isPlaying() and not controller.paused:
            app.terminate_(None)
            return
        i = bisect_right(starts, player.currentTime()) - 1
        if i < 0 or i == state["current"]:
            return
        prev = state["current"]
        if prev is not None:
            r = word_range(words[prev])
            storage.removeAttribute_range_(NSBackgroundColorAttributeName, r)
            storage.removeAttribute_range_(NSForegroundColorAttributeName, r)
        r = word_range(words[i])
        storage.addAttribute_value_range_(
            NSBackgroundColorAttributeName, NSColor.systemYellowColor(), r
        )
        storage.addAttribute_value_range_(NSForegroundColorAttributeName, NSColor.blackColor(), r)
        view.scrollRangeToVisible_(r)
        state["current"] = i

    NSTimer.scheduledTimerWithTimeInterval_repeats_block_(TICK_SECONDS, True, tick)
    # A script launched from a terminal can't reliably activate itself on recent
    # macOS, so float the window and order it front regardless of activation.
    window.setLevel_(NSFloatingWindowLevel)
    window.makeKeyAndOrderFront_(None)
    window.orderFrontRegardless()
    app.activateIgnoringOtherApps_(True)
    try:
        app.run()
    finally:
        player.stop()
