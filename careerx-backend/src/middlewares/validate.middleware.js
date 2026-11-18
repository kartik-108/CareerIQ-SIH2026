// Generic Zod validation middleware factory.
// Usage: router.post('/register', validate(registerSchema), controller)
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse({
    body: req.body,
    params: req.params,
    query: req.query,
  });

  if (!result.success) {
    const fields = result.error.issues.reduce((errors, issue) => {
      const path = issue.path[0] === 'body' || issue.path[0] === 'query' || issue.path[0] === 'params' ? issue.path.slice(1) : issue.path;
      errors[path.join('.') || 'request'] = issue.message;
      return errors;
    }, {});
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      details: result.error.flatten().fieldErrors,
      fields,
    });
  }

  // Overwrite with parsed/coerced values.
  if (result.data.body) req.body = result.data.body;
  if (result.data.query) req.query = result.data.query;
  next();
};
