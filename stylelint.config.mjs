export default {
  extends: 'stylelint-config-recommended',
  rules: {
    // style.css is fully mobile-first responsive (320px -> 4K), so the same
    // selector legitimately reappears across separate @media breakpoints to
    // override earlier rules. Both rules treat that expected pattern as a
    // defect (hundreds of false positives on this file) — disabled globally.
    'no-duplicate-selectors': null,
    'no-descending-specificity': null,
  },
};
