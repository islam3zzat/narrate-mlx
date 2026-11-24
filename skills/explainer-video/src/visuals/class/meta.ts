import type {Meta} from '../meta-types';
import {capabilities} from './capabilities';

export const meta: Meta<'class'> = {
  type: 'class',
  capabilities,
  docs: {
    fields: "`heading`, `classes[{id, name, stereotype?, attributes[], methods[], tone?}]`, `relations[{from, to, type, label?}]`, `direction?`, `caption?`",
    use: "UML class or data-model diagrams (2 to 6 classes)",
    rules: [
      "`attributes` and `methods` are plain lines of 34 characters or fewer; relation `type` is one of `inherits` and `implements` (`from` is the child, `to` the parent, parent drawn on top), `composes` and `aggregates` (`from` is the whole), `associates`, `depends`. Class diagrams are drawn without animated dots.",
    ],
  },
  lint: () => ({errors: [], warnings: []}),
  focusTargets: (v) => ({ids: v.classes.map((c) => c.id), links: v.relations.map((r) => [r.from, r.to])}),
};
