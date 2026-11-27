"""Native macOS window that shows text and highlights the word being spoken."""
import time
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
    NSDownArrowFunctionKey,
    NSFloatingWindowLevel,
    NSFont,
    NSFontAttributeName,
    NSFontManager,
    NSForegroundColorAttributeName,
    NSItalicFontMask,
    NSLeftArrowFunctionKey,
    NSMakeRange,
    NSMakeRect,
    NSMaxRange,
    NSMenu,
    NSMenuItem,
    NSMutableParagraphStyle,
    NSNormalWindowLevel,
    NSParagraphStyleAttributeName,
    NSRightArrowFunctionKey,
    NSScrollView,
    NSSegmentedControl,
    NSSegmentSwitchTrackingSelectOne,
    NSTextAlignmentRight,
    NSTextView,
    NSUnderlineStyleAttributeName,
    NSUnderlineStyleSingle,
    NSUpArrowFunctionKey,
    NSViewBoundsDidChangeNotification,
    NSWindow,
    NSWindowStyleMaskClosable,
    NSWindowStyleMaskResizable,
    NSWindowStyleMaskTitled,
    NSWritingDirectionRightToLeft,
)
from AVFoundation import AVAudioPlayer
from Foundation import NSURL, NSNotificationCenter, NSObject, NSTimer

TICK_SECONDS = 0.03
SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0]  # AVAudioPlayer supports 0.5-2.0
SEEK_MARGIN = 0.02  # seconds
AUTO_SCROLL_PAUSE_SECONDS = 3.0
BAR_HEIGHT = 40
BASE_SIZE = 20
HEADING_SIZES = {"h1": 32, "h2": 26, "h3": 22}
BLOCK_KINDS = {"h1", "h2", "h3", "h4", "h5", "h6", "list", "quote", "codeblock"}
_SENTENCE_END = (".", "!", "?", "؟")


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


def sentence_starts(text: str, words: list[Word]) -> list[int]:
    """Return word indices that begin a sentence or paragraph block."""
    if not words:
        return []
    starts = [0]
    for i in range(1, len(words)):
        prev = words[i - 1]
        cur = words[i]
        prev_tok = text[prev.begin:prev.end]
        gap = text[prev.end:cur.begin]
        if prev_tok.endswith(_SENTENCE_END) or any(ch in gap for ch in (*_SENTENCE_END, "\n")):
            starts.append(i)
    return starts


def next_sentence_index(sent_indices: list[int], current: int | None, direction: int) -> int | None:
    """Return the target word index for stepping backward (<0) or forward (>0) by sentence."""
    if not sent_indices:
        return None
    cur = 0 if current is None else current
    if direction > 0:
        pos = bisect_right(sent_indices, cur)
        return sent_indices[pos] if pos < len(sent_indices) else None
    pos = max(bisect_right(sent_indices, cur) - 1, 0)
    if cur - sent_indices[pos] > 1:
        return sent_indices[pos]
    return sent_indices[max(pos - 1, 0)]


def step_speed_index(current_idx: int, delta: int, count: int = len(SPEEDS)) -> int:
    """Clamp speed segment index when stepping up/down."""
    return max(0, min(count - 1, current_idx + delta))


def should_auto_scroll(now: float, paused_until: float) -> bool:
    """Return True once the temporary pause after manual scrolling has elapsed."""
    return now >= paused_until


def speed_labels(base_speed: float = 1.0) -> list[str]:
    """Effective playback rate labels for the speed segmented control."""
    return [f"{round(base_speed * s, 2):g}×" for s in SPEEDS]


def _install_main_menu(app) -> None:
    menubar = NSMenu.alloc().init()

    app_item = NSMenuItem.alloc().initWithTitle_action_keyEquivalent_("", None, "")
    menubar.addItem_(app_item)
    app_menu = NSMenu.alloc().initWithTitle_("narrate-mlx")
    app_menu.addItem_(NSMenuItem.alloc().initWithTitle_action_keyEquivalent_("Quit narrate-mlx", "terminate:", "q"))
    app_item.setSubmenu_(app_menu)

    file_item = NSMenuItem.alloc().initWithTitle_action_keyEquivalent_("File", None, "")
    menubar.addItem_(file_item)
    file_menu = NSMenu.alloc().initWithTitle_("File")
    file_menu.addItem_(NSMenuItem.alloc().initWithTitle_action_keyEquivalent_("Close Window", "performClose:", "w"))
    file_item.setSubmenu_(file_menu)

    edit_item = NSMenuItem.alloc().initWithTitle_action_keyEquivalent_("Edit", None, "")
    menubar.addItem_(edit_item)
    edit_menu = NSMenu.alloc().initWithTitle_("Edit")
    edit_menu.addItem_(NSMenuItem.alloc().initWithTitle_action_keyEquivalent_("Copy", "copy:", "c"))
    edit_menu.addItem_(NSMenuItem.alloc().initWithTitle_action_keyEquivalent_("Select All", "selectAll:", "a"))
    edit_item.setSubmenu_(edit_menu)

    app.setMainMenu_(menubar)


class _Controller(NSObject):
    """App delegate and target of the bar's controls."""

    paused = False
    finished = False
    window = None
    speed_control = None
    on_replay = None
    on_user_scroll = None

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
        if self.finished and self.on_replay:
            self.on_replay()
            return
        if self.paused:
            self.player.play()
        else:
            self.player.pause()
        self.paused = not self.paused
        self.pause_button.setTitle_("Resume" if self.paused else "Pause")

    def boundsDidChange_(self, _notif):
        if self.on_user_scroll:
            self.on_user_scroll()


class _ReaderView(NSTextView):
    """Text view that reports clicks (to seek) and keyboard playback/close shortcuts."""

    on_click = None  # called with the clicked UTF-16 character index
    on_space = None
    on_close = None
    on_seek_sentence = None
    on_step_speed = None

    def mouseDown_(self, event):
        point = self.convertPoint_fromView_(event.locationInWindow(), None)
        # The default handler tracks the mouse until release, so a drag still selects.
        objc.super(_ReaderView, self).mouseDown_(event)
        if self.selectedRange().length == 0 and self.on_click:
            self.on_click(self.characterIndexForInsertionAtPoint_(point))

    def cancelOperation_(self, _sender):
        if self.on_close:
            self.on_close()

    def keyDown_(self, event):
        chars = event.characters() or ""
        code = event.keyCode()
        if chars == " " and self.on_space:
            self.on_space()
        elif (chars == "\x1b" or code == 53) and self.on_close:
            self.on_close()
        elif (chars == chr(NSLeftArrowFunctionKey) or code == 123) and self.on_seek_sentence:
            self.on_seek_sentence(-1)
        elif (chars == chr(NSRightArrowFunctionKey) or code == 124) and self.on_seek_sentence:
            self.on_seek_sentence(1)
        elif (chars == chr(NSUpArrowFunctionKey) or code == 126) and self.on_step_speed:
            self.on_step_speed(1)
        elif (chars == chr(NSDownArrowFunctionKey) or code == 125) and self.on_step_speed:
            self.on_step_speed(-1)
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


def show_and_play(
    text: str,
    words: list[Word],
    styles: list[Style],
    wav_path: str,
    rtl: bool = False,
    base_speed: float = 1.0,
    auto_close: bool = False,
) -> None:
    """Open the window, play wav_path, and highlight words in sync.

    rtl lays the text out right to left, right-aligned (Arabic).
    Blocks until the window is closed (or playback finishes when auto_close=True).
    """
    app = NSApplication.sharedApplication()
    app.setActivationPolicy_(NSApplicationActivationPolicyRegular)
    _install_main_menu(app)
    controller = _Controller.alloc().init()
    app.setDelegate_(controller)

    style = NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskResizable
    window = NSWindow.alloc().initWithContentRect_styleMask_backing_defer_(
        NSMakeRect(0, 0, 720, 480), style, NSBackingStoreBuffered, False
    )
    window.setTitle_("narrate-mlx")
    window.center()
    window.setReleasedWhenClosed_(False)
    controller.window = window

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
    for i, label in enumerate(speed_labels(base_speed)):
        speed.setLabel_forSegment_(label, i)
    speed.setTrackingMode_(NSSegmentSwitchTrackingSelectOne)
    speed.setSelectedSegment_(SPEEDS.index(1.0))
    speed.setToolTip_("Playback speed (effective rate)")
    speed.setAutoresizingMask_(1 | 4)  # stay centered horizontally
    speed.setTarget_(controller)
    speed.setAction_("speedChanged:")
    content.addSubview_(speed)
    controller.speed_control = speed

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
    sent_indices = sentence_starts(text, words)
    state = {"current": None}
    scroll_state = {"in_auto": False, "paused_until": 0.0}

    def word_range(w: Word):
        return NSMakeRange(u[w.begin], u[w.end] - u[w.begin])

    def clear_highlight() -> None:
        prev = state["current"]
        if prev is not None:
            r = word_range(words[prev])
            storage.removeAttribute_range_(NSBackgroundColorAttributeName, r)
            storage.removeAttribute_range_(NSForegroundColorAttributeName, r)
            state["current"] = None

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

    def resume_from(time_sec: float) -> None:
        controller.finished = False
        controller.paused = False
        pause.setTitle_("Pause")
        window.setTitle_("narrate-mlx")
        player.setCurrentTime_(time_sec)
        player.setRate_(SPEEDS[speed.selectedSegment()])
        if not player.isPlaying():
            player.play()

    def seek_to_word_index(i: int | None) -> None:
        if i is None:
            return
        scroll_state["paused_until"] = 0.0
        # Land just inside the word: the player rounds to whole audio frames, and
        # landing just before would highlight the previous word for a tick.
        resume_from(words[i].start + SEEK_MARGIN)

    def seek_to_word(index: int) -> None:
        seek_to_word_index(seek_index(begins, index))

    def seek_sentence(direction: int) -> None:
        cur = state["current"]
        if cur is None and controller.finished and words:
            cur = len(words) - 1
        target = next_sentence_index(sent_indices, cur, direction)
        seek_to_word_index(target)

    def step_speed(delta: int) -> None:
        nxt = step_speed_index(speed.selectedSegment(), delta)
        if nxt != speed.selectedSegment():
            speed.setSelectedSegment_(nxt)
            player.setRate_(SPEEDS[nxt])

    def replay() -> None:
        clear_highlight()
        scroll_state["paused_until"] = 0.0
        resume_from(0.0)

    def close_window() -> None:
        window.performClose_(None)

    def on_user_scroll() -> None:
        if not scroll_state["in_auto"]:
            scroll_state["paused_until"] = time.monotonic() + AUTO_SCROLL_PAUSE_SECONDS

    clip = scroll.contentView()
    clip.setPostsBoundsChangedNotifications_(True)
    nc = NSNotificationCenter.defaultCenter()
    controller.on_user_scroll = on_user_scroll
    nc.addObserver_selector_name_object_(controller, "boundsDidChange:", NSViewBoundsDidChangeNotification, clip)

    controller.on_replay = replay
    view.on_click = seek_to_word
    view.on_space = controller.toggle_pause
    view.on_close = close_window
    view.on_seek_sentence = seek_sentence
    view.on_step_speed = step_speed
    window.makeFirstResponder_(view)

    def tick(_timer):
        if not player.isPlaying() and not controller.paused:
            if auto_close:
                app.terminate_(None)
            elif not controller.finished:
                controller.finished = True
                pause.setTitle_("Replay")
                window.setTitle_("narrate-mlx — Finished (Space to replay, Esc to close)")
            return
        i = bisect_right(starts, player.currentTime()) - 1
        if i < 0 or i == state["current"]:
            return
        clear_highlight()
        r = word_range(words[i])
        storage.addAttribute_value_range_(
            NSBackgroundColorAttributeName, NSColor.systemYellowColor(), r
        )
        storage.addAttribute_value_range_(NSForegroundColorAttributeName, NSColor.blackColor(), r)
        if should_auto_scroll(time.monotonic(), scroll_state["paused_until"]):
            scroll_state["in_auto"] = True
            try:
                view.scrollRangeToVisible_(r)
            finally:
                scroll_state["in_auto"] = False
        state["current"] = i

    NSTimer.scheduledTimerWithTimeInterval_repeats_block_(TICK_SECONDS, True, tick)
    # A script launched from a terminal can't reliably activate itself on recent
    # macOS, so briefly float the window to surface it, then drop back to normal level.
    window.setLevel_(NSFloatingWindowLevel)
    window.makeKeyAndOrderFront_(None)
    window.orderFrontRegardless()
    app.activateIgnoringOtherApps_(True)
    NSTimer.scheduledTimerWithTimeInterval_repeats_block_(0.35, False, lambda _t: window.setLevel_(NSNormalWindowLevel))
    try:
        app.run()
    finally:
        nc.removeObserver_(controller)
        player.stop()
