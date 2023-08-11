
// ██╗   ██╗ ██████╗ ██╗ ██████╗███████╗     ██████╗ ██████╗ ███╗   ██╗████████╗██████╗  ██████╗ ██╗
// ██║   ██║██╔═══██╗██║██╔════╝██╔════╝    ██╔════╝██╔═══██╗████╗  ██║╚══██╔══╝██╔══██╗██╔═══██╗██║
// ██║   ██║██║   ██║██║██║     █████╗      ██║     ██║   ██║██╔██╗ ██║   ██║   ██████╔╝██║   ██║██║
// ╚██╗ ██╔╝██║   ██║██║██║     ██╔══╝      ██║     ██║   ██║██║╚██╗██║   ██║   ██╔══██╗██║   ██║██║
//  ╚████╔╝ ╚██████╔╝██║╚██████╗███████╗    ╚██████╗╚██████╔╝██║ ╚████║   ██║   ██║  ██║╚██████╔╝███████╗
//   ╚═══╝   ╚═════╝ ╚═╝ ╚═════╝╚══════╝     ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚══════╝
// NOTE Deps:
// https://github.com/bahamas10/hue-cli
// npm i -g hue-cli

import vosk from 'vosk';
import fs from 'fs';
import mic from 'mic';
import { homedir } from 'os';
import { join } from 'path';
import { token_set_ratio, extract } from 'fuzzball';
import { spawn } from 'node:child_process';
import 'colors';


// ┌─┐┌─┐┌┐┌┌─┐┬┌─┐
// │  │ ││││├┤ ││ ┬
// └─┘└─┘┘└┘└  ┴└─┘

const MODEL_PATH = "model";
const SAMPLE_RATE = 16000;
const DEBUG_LOG = true;
const USING_HUE = true;

// ┬  ┬┌─┐┬ ┬┌┬┐┌─┐  ┬ ┬┌─┐┌┐┌┌┬┐┬  ┌─┐┬─┐
// │  ││ ┬├─┤ │ └─┐  ├─┤├─┤│││ │││  ├┤ ├┬┘
// ┴─┘┴└─┘┴ ┴ ┴ └─┘  ┴ ┴┴ ┴┘└┘─┴┘┴─┘└─┘┴└─

const CURRENT_LAMP = 'guļam istabas lampa';
const colors = ['red', 'blue', 'white'];

const changeColor = async (words) => {
  if (!words) return;
  const result = extract(words, colors, { scorer: token_set_ratio, returnObjects: true });

  const [mostLikely] = result;
  if (mostLikely.score < 75) return;

  await spawner('hue', ['lights', '2', mostLikely.choice]);
};

const lightsActions = {
  "on": async () => await spawner('hue', ['lights', '2', 'on']),
  "off": async () => await spawner('hue', ['lights', '2', 'off']),
  "color": async (words) => await changeColor(words)
};

const lightsHandler = async (words) => {
  if (!words.length) return;
  const scores = extract(words, Object.keys(lightsActions), { scorer: token_set_ratio, returnObjects: true });

  const [likelyKeyword] = scores;
  deblog('LIGHTS'.green, scores);
  if (likelyKeyword.score < 75) return;

  const action = lightsActions[likelyKeyword.choice];
  if (action) await action(words);
};


// ╔╦╗┌─┐┬┌┐┌  ┬ ┬┌─┐┌┐┌┌┬┐┬  ┌─┐┬─┐
// ║║║├─┤││││  ├─┤├─┤│││ │││  ├┤ ├┬┘
// ╩ ╩┴ ┴┴┘└┘  ┴ ┴┴ ┴┘└┘─┴┘┴─┘└─┘┴└─

const PRIMARY_KEYWORD_HANDLERS = {
  ...(USING_HUE ? { "lights": lightsHandler, "hue": lightsHandler } : {}),
};

const keywordOptions = { scorer: token_set_ratio, returnObjects: true };
const keywordChoices = Object.keys(PRIMARY_KEYWORD_HANDLERS);

const handler = async ({ text }) => {
  const [keyword, ...rest] = text.split(' ');
  if (!keyword.length) return;

  const scores = extract(keyword, keywordChoices, keywordOptions);
  const [likelyKeyword] = scores;
  deblog('KEYWORD'.green, scores);
  if (likelyKeyword.score < 75) return;

  const keywordHandler = PRIMARY_KEYWORD_HANDLERS[likelyKeyword.choice];
  if (keywordHandler) await keywordHandler(rest.join(' '));
};

// ┌─┐┌─┐┌┬┐┬ ┬┌─┐
// └─┐├┤  │ │ │├─┘
// └─┘└─┘ ┴ └─┘┴

const setupHue = async () => {
  if (!fs.existsSync(`${homedir()}/.hue.json`)) {
    const stations = await spawner('hue' ['--json', 'search']);
    const [first] = JSON.parse(stations);
    if (!first) bail('Could not find a hue station');

    await spawner('hue' ['-H', first, 'register']);
  }
};

const setup = async () => {
  if (!fs.existsSync(MODEL_PATH)) {
    console.error(`Please download a model from https://alphacephei.com/vosk/models and unpack to folder ${MODEL_PATH} in the root folder.`);
    process.exit();
  }

  if (USING_HUE) await setupHue();

  vosk.setLogLevel(0);
  const model = new vosk.Model(MODEL_PATH);
  const rec = new vosk.Recognizer({ model: model, sampleRate: SAMPLE_RATE });

  var micInstance = mic({
    rate: String(SAMPLE_RATE),
    channels: '1',
    debug: false
  });

  var micInputStream = micInstance.getAudioStream();
  micInstance.start();

  micInputStream.on('data', async (data) => {
    if (rec.acceptWaveform(data)) await handler(rec.result());
    // else console.log(rec.partialResult());
  });

  process.on('SIGINT', function() {
    console.log("\nDone");
    rec.free();
    model.free();
  });
};

setImmediate(setup);


// ┬ ┬┌┬┐┬┬
// │ │ │ ││
// └─┘ ┴ ┴┴─┘

const spawner = async (...args) => {
  let process = null;
  const promise = new Promise((resolve) => {
    let data = [];
    process = spawn(...args);
    process.on('data', (line) => data.push(line));
    process.on('exit', () => resolve(data.join()));
  });

  promise.process = process;
  return promise;
};

const bail = (errorMessage) => {
  console.error('BAILING'.red, errorMessage);
  process.exit();
};

const deblog = (...args) => DEBUG_LOG && console.log(...args);
