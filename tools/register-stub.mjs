/* Регистрирует подмену 'three' на заглушку.
   Запуск проверки набора:
     node --import ./tools/register-stub.mjs tools/check-kit.mjs
*/

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./three-loader.mjs', pathToFileURL(import.meta.filename));
