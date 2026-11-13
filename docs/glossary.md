# Glossary

The app’s social vocabulary. Check a new label against this file before it ships. Tone is short, human, and specific. Sentence case. Say the thing the person does.

## Voice

- Name the action in plain words. Open page. Close page. Open launcher. Stand with Alice. Endorse Alice. Support. Message.
- A button that only shows an icon still has an accessible name in those words. The name is the `aria-label`. The glyph is hidden from the accessibility tree.
- Do not use chain jargon in a label or a toast body. Avoid on-chain, transaction hash, gas, contract, and wallet-speak. Explorer links may say View on Nearblocks.
- Pending copy ends with an ellipsis character (`…`), not three dots. Social pending is short: Collecting SOCIAL…. Success is a finished sentence: SOCIAL collected.
- Governance copy can be a full line and still stays plain: Submitting proposal…. Delegation confirmed.
- Face gestures are quiet verbs, not pills: Stand, Endorse, Support, Message. Separators are a middle dot. Standing is the state after Stand. Step back is how you leave it.
- Account ids stay whole. Do not strip `.near` or `.testnet` from a handle.

## Labels touched with the page pill

| Surface                  | Name                     | Notes                                                         |
| ------------------------ | ------------------------ | ------------------------------------------------------------- |
| Portfolio swipe-up pill  | Open page                | Opens the page drawer. Real button. `aria-haspopup="dialog"`. |
| Page drawer close        | Close page               | Same noun. Not Close sheet, not Dismiss.                      |
| Dock grip                | Open launcher            | The grip is the launcher, not the page.                       |
| Own empty Writing shelf  | Longer pieces live here. | Shown to the owner when they have no articles.                |
| Own empty Writing action | Write an article         | Opens compose already in article mode.                        |

Open page is the name of the pill. Do not rename it to Swipe up, Chevron, or Open portfolio.

## Boost

| Surface                          | Name                     | Notes                                                                                |
| -------------------------------- | ------------------------ | ------------------------------------------------------------------------------------ |
| Boost sheet, commit did not land | Could not commit SOCIAL. | The button stays Commit or Increase. Do not say gas, relayer, limit, or transaction. |
