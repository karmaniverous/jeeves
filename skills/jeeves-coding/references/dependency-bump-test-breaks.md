# Tests broken by a dependency update

Use this when a dependency update (the repo owner's commit or your own `ncu` pass) turns tests red.

## 1. Find the culprit before fixing

- Pull, run the full `npm test`, and list the failing files and their error messages.
- Test one suspect at a time, starting with the major bumps. Put that dependency back to its old version locally, keep every other upgrade, and rerun only the failing files. Any failures left belong to another dependency.
- Restore `package.json` and the lockfile afterwards, and check `git status` is clean before you branch.
- Report to the repo owner with counts per cause (e.g. "9 from jsdom 31, 1 from lucide-react 1.75") before or alongside the fix.

## 2. e2e fails everywhere: host setup, not tests

If every Playwright test fails with `browserType.launch: Executable doesn't exist ... ms-playwright...`, the update moved Playwright and the machine running the tests lacks its browser. Run `npx playwright install chromium`, then rerun the full e2e suite. Tell the repo owner they need the same before their next local e2e or release run.

## 3. Fix rules

- Make tests match the new library behaviour, which is usually closer to real browsers. Never pin the dependency back, loosen assertions or skip tests without the repo owner's approval. Change app code only if the app is actually wrong in browsers.
- Model real user input in tests. For example, a click is `pointerdown` + `mousedown`, then focus, not focus alone.

## 4. Known breaks

- **jsdom 31: `getComputedStyle` is read-only.** Writing to it throws `NoModificationAllowedError`. A helper that forces a style should return a `Proxy` over the real declaration. The Proxy answers the forced property through both its camelCase name and `getPropertyValue('kebab-name')`, and binds every other function to the real target.
- **jsdom 31: `:focus-visible` is the same as `:focus`.** Its selector engine has no input-modality heuristic. Add a setup shim, installed per test and removed in teardown:
  - Track the last input on `document` in the capture phase. A `keydown` without Ctrl, Alt or Meta means keyboard. `pointerdown` or `mousedown` means pointer. Before any input, treat focus as keyboard.
  - Patch `Element.prototype.matches` only for `':focus-visible'`. It returns `:focus && (keyboard || field takes text)`.
  - Patch it via `Object.getOwnPropertyDescriptor` + `Object.defineProperty`, and call the original with `Reflect.apply`. Destructuring `proto.matches` fails lint (`unbound-method`). Restore the saved descriptor in teardown.
  - Give the shim its own unit tests.
- **lucide-react minors rename rendered classes** (e.g. `TriangleAlert` now renders `lucide-triangle-exclamation-point`). Derive the expected class from the imported icon component in the test, not a string literal.

## Done when

Full unit and e2e suites and all gates pass, the PR body lists each cause, its tests and its fix, and CI is green on the pushed head.
