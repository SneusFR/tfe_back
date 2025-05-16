// src/flow/flowLogWrapper.js
import logPersist from './logPersist.js';
import flowLog from './flowLogger.js';

// Export the original flowLog as a fallback
export { flowLog };

// Export logPersist as the default export to replace flowLog
export default logPersist;
