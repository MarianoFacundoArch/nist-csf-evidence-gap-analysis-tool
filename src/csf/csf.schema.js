/**
 * JSON Schema for the CSF 2.0 core data file.
 *
 * The official subcategory text is public domain and comes from the NIST CPRT
 * (Cybersecurity and Privacy Reference Tool). The shipped file is a SAMPLE
 * subset; the schema is intentionally permissive about how many subcategories
 * are present so a full 106-item export validates just the same.
 */

export const csfSchema = {
  type: 'object',
  additionalProperties: true,
  required: ['functions', 'subcategories'],
  properties: {
    frameworkVersion: { type: 'string' },
    sample: { type: 'boolean' },
    functions: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'name'],
        additionalProperties: true,
        properties: {
          id: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
        },
      },
    },
    subcategories: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['function', 'category', 'id', 'outcome'],
        additionalProperties: true,
        properties: {
          function: { type: 'string', minLength: 1 },
          category: { type: 'string', minLength: 1 },
          id: { type: 'string', minLength: 1 },
          outcome: { type: 'string', minLength: 1 },
        },
      },
    },
  },
};
