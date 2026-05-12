/**
 * Minimal type shim for react-test-renderer.
 *
 * The @types/react-test-renderer package isn't pinned in our
 * dependencies, and `tsc --noEmit` chokes on the bare import in jest
 * snapshot tests. The runtime works fine — Jest resolves the JS just
 * fine — so we just need TypeScript to see SOMETHING for the module.
 *
 * If you ever want strict types here, run:
 *   npm i -D @types/react-test-renderer
 * and delete this file.
 */
declare module 'react-test-renderer' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const TestRenderer: any;
  export default TestRenderer;
}
