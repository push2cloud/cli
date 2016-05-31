#!/usr/bin/env node

const join = require('path').join;
const chalk = require('chalk');
const prepare = require('push2cloud-compiler/prepare');
const compile = require('push2cloud-compiler/compile');
const buildWorkspace = require('push2cloud-compiler/build-workspace');
const writeJsonFile = require('write-json-file');
const logSymbols = require('log-symbols');
const Epochjs = require('epochjs');
const epochjs = new Epochjs();

const DEPLOYMENT_MANIFEST = 'deploymentManifest.json';

const req = (p) => {
  const pathToReq = p.replace(/^\./, process.cwd());
  var required = null;
  try {
    required = require(pathToReq);
  } catch (err) {
    if (pathToReq.indexOf(process.cwd()) === 0) {
      throw err;
    }
    required = require(join(process.cwd(), 'node_modules', pathToReq));
  }
  return required;
};

const timeElapsed = () => {
  var elapsed = epochjs.secElapsed();
  if (elapsed < 60) return elapsed + ' seconds';
  return (elapsed / 60).toFixed(2) + ' minutes';
};

const error = (text, err) => {
  console.log(text + ' ' + logSymbols.error + ' ' + timeElapsed() + '\n\t' + chalk.red(err));
  if (err.stack) console.log(err.stack);
  process.exit(1);
};

const done = (text, next) => (err, result) => {
  if (err) return error(text, err);
  console.log(text + ' ' + chalk.green(logSymbols.success) + ' ' + timeElapsed());
  if (next) next(null, result);
};

const progress = (msg) => (ctx, cb) => {
  console.log(msg);
  cb(null, ctx);
};

const pluginsOption = {
  alias: 'plugins',
  description: 'Plugins for prepare, preCompile, compile, buildWorkspace.',
  required: true
};

const deploymentManifestOption = {
  alias: 'deploymentManifest',
  description: 'path to the deploymentManifest'
};

const commandDefault = (yargs) => {
  return yargs
    .config('settings')
    .default('settings', join(process.cwd(), 'push2cloud-config.json'))
    .help('h')
    .alias('h', 'help')
    .argv;
};

const compileCmd = (yargs) => {
  const argv = commandDefault(yargs
    .usage('Usage: $0 compile [options]')
    .option('e', deploymentManifestOption)
    .option('plugins', pluginsOption)
    .array('plugins.prepare')
    .array('plugins.compile')
    .array('plugins.buildWorkspace')
    .option('l', {})
    .default('deploymentManifest', join(process.cwd(), DEPLOYMENT_MANIFEST), './' + DEPLOYMENT_MANIFEST)
  );

  const preparePlugins = argv.plugins.prepare.map(req);
  const compilePlugins = argv.plugins.compile.map(req);
  const buildWorkspacePlugins = argv.plugins.buildWorkspace.map(req);

  console.log('prepare');
  epochjs.start();
  prepare(
     preparePlugins
  , join(process.cwd(), argv.deploymentManifest)
  , null
  , done('prepare', () => {
    console.log('compile');
    epochjs.start();
    const compileDone = done('compile');
    compile(compilePlugins, null, null, (err, content) => {
      if (err) return compileDone(err);

      writeJsonFile('deploymentConfig.json', content)
      .then(() => {
        compileDone();
        console.log('build');
        epochjs.start();
        buildWorkspace(buildWorkspacePlugins
                     , null, null, done('build'));
      })
      .catch(compileDone);
    });
  }));

  return yargs;
};

const lintCmd = (yargs) => {
  commandDefault(yargs.usage('Usage: $0 lint [options]'));
  return yargs;
};

const execCmd = (yargs) => {
  const argv = commandDefault(
    yargs
      .usage('Usage: $0 exec <workflow> [options]')
    );

  const wf = argv._[1];
  console.log(`Workflow: ${wf} `);
  epochjs.start();
  const workflow = req(wf);
  const deploymentConfig = require(join(process.cwd(), 'deploymentConfig.json'));
  workflow(deploymentConfig
         , progress
         , (err, ctx) => done(`Workflow: ${wf} done`, () => process.exit(0))(err, ctx));
  return yargs;
};

require('yargs')

  // basic usage
  .usage('Usage: $0 <command> [options]')
  .demand(2)

  // commands
  .command('exec', 'Execute a workflow.', execCmd)

  .command('compile', 'Compile the manifests to a deploymentconfig.', compileCmd)

  .command('lint', 'Lint the manifests.', lintCmd)

  .command('ls', 'List manifests/workflows/schemas.', lintCmd)

  // help
  .help('h')
  .alias('h', 'help')

  .epilog('http://github.com/org/repo')
  .argv;
