const createJSONError = (error) => {
  return {
    error: {
      code: error.code,
      message: error.message,
      stack: error.stack,
    }
  };
}

const createJSONResult = (result) => {
  return {
    ts: Date.now(),
    result: result,
  };
}

module.exports = { createJSONError, createJSONResult };
