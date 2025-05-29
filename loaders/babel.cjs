const register = require('@babel/register')

register({
  compact: false,
  ignore: [], // do not ignore node_modules
})
