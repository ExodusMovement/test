const register = require('@babel/register')

register({
  compact: false,
  babelrc: false,
  plugins: ['@babel/plugin-transform-modules-commonjs'],
  ignore: [], // do not ignore node_modules
})
