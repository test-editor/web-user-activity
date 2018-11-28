// Karma configuration file, see link for more information
// https://karma-runner.github.io/1.0/config/configuration-file.html

module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular/cli'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-firefox-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage-istanbul-reporter'),
      require('@angular/cli/plugins/karma')
    ],
    client:{
      clearContext: false // leave Jasmine Spec Runner output visible in browser
    },
    coverageIstanbulReporter: {
      reports: [ 'html', 'lcovonly' ],
      fixWebpackSourcePaths: true
    },
    angularCli: {
      environment: 'dev',
      sourcemaps: false,
      COMMENT_on_sourcemaps: [
        'as described in issue https://github.com/angular/angular-cli/issues/7296',
        'source maps have to be turned off for ng cli in face of karma tests',
        'for legible error messages in some cases (e.g. html template access missing function)',
        'this configuration however is only used when running `karma start`'
      ]
    },
    reporters: ['progress', 'kjhtml', 'coverage-istanbul'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    files: [ 'src/**/*.ts', 'src/**/*.css', 'src/**/*.html' ],
    autoWatch: true,
    watchOptions: {
      ignored: /node_modules/
    },
    browsers: [ 'Chrome', 'Firefox' ],
    singleRun: false
  });
};
