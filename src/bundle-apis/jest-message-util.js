// Used in expect toThrowMatchers
// TODO: figure out if a better impl is actually needed

export const formatStackTrace = (stack) => stack
export const separateMessageFromStack = (content) => ({ stack: content })
