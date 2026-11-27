// Bundle the approved document's integration using the application's installed tools.
const path = require('node:path');
const webpack = require('webpack');
const frontend = path.resolve(__dirname, '..');
process.env.BABEL_ENV = 'production';

function buildApprovedV3(outputPath) {
  return new Promise((resolve, reject) => {
    webpack({
      mode: 'production',
      target: ['web', 'es2020'],
      entry: path.join(frontend, 'src/approvedV3/nativeWorkspace.js'),
      output: {
        path: outputPath,
        filename: 'approved-v3-native.js',
        chunkFilename: 'static/js/approved-v3-[id].[contenthash:8].js',
        publicPath: '/',
        clean: false,
      },
      resolve: {
        alias: {'@': path.join(frontend, 'src'), '@catalogs': path.resolve(frontend, '../shared/catalogs')},
        extensions: ['.js', '.jsx', '.json'],
      },
      module: {rules: [{
        test: /\.jsx?$/,
        include: path.join(frontend, 'src'),
        use: {loader: require.resolve('babel-loader'), options: {
          babelrc: false, configFile: false, sourceType: 'unambiguous',
          presets: [[require.resolve('babel-preset-react-app'), {runtime:'automatic'}]],
        }},
      }]},
      plugins: [new webpack.DefinePlugin({
        'process.env.REACT_APP_BACKEND_URL': JSON.stringify(''),
        'process.env.REACT_APP_PREVIEW': JSON.stringify('true'),
        'process.env.REACT_APP_STANDARD_SIGN_IN': JSON.stringify('true'),
      })],
      performance: {hints: false},
    }, (error, stats) => {
      if (error) return reject(error);
      if (stats.hasErrors()) return reject(new Error(stats.toString({all:false, errors:true})));
      process.stdout.write(stats.toString({all:false, assets:true, warnings:true})+'\n');
      resolve();
    });
  });
}

module.exports = {buildApprovedV3};
if (require.main === module) buildApprovedV3(path.resolve(frontend, '../deploy/cloudflare/dist'))
  .catch(error => {process.stderr.write(error.message+'\n');process.exitCode=1;});
