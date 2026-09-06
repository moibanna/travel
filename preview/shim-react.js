/* The tracker imports React normally; in the published page React arrives as a
   UMD global instead. This maps one onto the other at bundle time. */
const React = window.React;
export default React;
export const {
  useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect,
  Fragment, createElement, memo,
} = React;
