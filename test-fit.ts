import { fit2json, parseRecords } from 'fit-decoder';
import fs from 'fs';
// create a dummy fit file
const buf = Buffer.from('0e104400000000002e464954', 'hex');
try {
  const json = fit2json(buf);
  console.log(json);
} catch (e) {
  console.log(e.message);
}
