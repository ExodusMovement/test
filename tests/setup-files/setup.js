const { default: path } = await import('path')

global.SETUP_JS_MODULE = path.basename(import.meta.url)
