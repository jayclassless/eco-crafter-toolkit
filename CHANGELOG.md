# Eco Crafter Toolkit Change Log

## 0.5.0 (TBD)

- The app now remembers the last build you had open, and returns you to it.

## 0.4.0 (2026-06-11)

- Now displays the skill next to recipe names in the dialogs where you're
  looking one up.
- Fixed some autocomplete dropdowns erasing your search text before you've
  chosen something.
- A variety of other minor bug fixes and under-the-hood optimizations.

## 0.3.0 (2026-05-25)

- Switched from CrowdIn to Weblate to get translations for Eco dataset items.
- Added an ad-hoc recipe calculator for when you want to roughly calculate the
  cost of items that aren't part of your build.
- Fixed how Barrels are handled so that they're treated as re-integrated
  products like Molds.
- Added an initial implementation of a Crop Tracker, so farmers and loggers can
  keep track of when their various plantings are due for harvesting (heavily
  inspired by the [Eco Farming Tracker](https://eco-farming-tracker.vercel.app/)).

## 0.2.0 (2026-05-12)

- Updated the Product list so that recipe families/variants (e.g., "Board",
  "Hardwood Board", and "Softwood Board") are grouped together.
- Added the ability to filter the Products lists by Blueprints.
- Added release notes to the About dialog.
- Fixed a couple path routing issues in the Dependency Graph visualizer, in an
  attempt to reduce how often things overlap.
- Added some safeguards around browser storage limits.

## 0.1.0 (2026-05-02)

- Initial public release.
