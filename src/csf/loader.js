/**
 * Loads and validates the CSF 2.0 core data file.
 *
 * Emits a clear, actionable error (never a raw crash) when the file is missing
 * or malformed, and prints a prominent banner when the SAMPLE subset is in use
 * so a user is never misled into thinking a 13-subcategory run is a full
 * 106-subcategory assessment.
 */

import Ajv from 'ajv';
import { csfSchema } from './csf.schema.js';
import { readJsonSafe, fileExists } from '../util/fsx.js';
import { CsfDataError } from '../core/errors.js';

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(csfSchema);

/**
 * @returns {Promise<{
 *   frameworkVersion: string, sample: boolean,
 *   functions: Array<{id:string,name:string}>,
 *   functionName: (id:string)=>string,
 *   subcategories: Array<{function:string,category:string,id:string,outcome:string,
 *     functionId:string,categoryId:string,functionName:string}>
 * }>}
 */
export async function loadCsfCore(path, logger) {
  if (!(await fileExists(path))) {
    throw new CsfDataError(`CSF core data file not found: ${path}`, {
      hint: 'Set "csfCorePath" in your config, or download the full export from NIST CPRT (https://csrc.nist.gov/projects/cprt).',
    });
  }

  let data;
  try {
    data = await readJsonSafe(path);
  } catch (err) {
    throw new CsfDataError(`CSF core data file is not valid JSON: ${path} (${err.message})`);
  }

  if (!validate(data)) {
    const first = (validate.errors ?? [])[0];
    throw new CsfDataError(
      `CSF core data file is malformed: ${path} — ${first ? `${first.instancePath || '(root)'} ${first.message}` : 'schema validation failed'}.`,
    );
  }

  // Subcategory ids must be unique (duplicates would collide in every store).
  const seen = new Set();
  for (const sub of data.subcategories) {
    if (seen.has(sub.id)) {
      throw new CsfDataError(`Duplicate subcategory id in CSF core data: ${sub.id}`);
    }
    seen.add(sub.id);
  }

  const functionName = (id) => data.functions.find((f) => f.id === id)?.name ?? id;

  // Enrich each subcategory with derived ids for prompting/reporting. The
  // function code is the prefix before "." in the id (e.g. "GV" in "GV.OC-01");
  // the category code is everything before "-" (e.g. "GV.OC").
  const subcategories = data.subcategories.map((sub) => {
    const functionId = sub.id.split('.')[0];
    const categoryId = sub.id.split('-')[0];
    return {
      ...sub,
      functionId,
      categoryId,
      functionName: functionName(functionId),
    };
  });

  const sample = data.sample === true;
  if (sample && logger) {
    logger.warn(
      `Using a PARTIAL CSF subset (${subcategories.length} of 106 subcategories) — this data file has "sample": true. ` +
        'Use the full NIST CPRT export (the shipped data/csf-core.json) for a real assessment.',
    );
  }

  return {
    frameworkVersion: data.frameworkVersion ?? 'CSF 2.0',
    sample,
    functions: data.functions,
    functionName,
    subcategories,
  };
}
