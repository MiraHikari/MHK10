// Compatibility import for older entrypoints. The inactive second desktop was removed.
export {
  mountEmbeddedBridge as mountNativeDesktop,
  mountEmbeddedBridge as initDesktop,
} from './browser-bridge';
