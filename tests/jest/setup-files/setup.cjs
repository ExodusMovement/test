const path = require('node:path')

globalThis.SETUP_CJS = path.basename(__filename) // using some cjs stuff here to make sure it works
