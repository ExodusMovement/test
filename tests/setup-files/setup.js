import path from 'node:path'

globalThis.SETUP_JS_MODULE = path.basename(import.meta.url)
