import vosk from 'vosk';
import fs from 'fs';
import mic from 'mic';
import { homedir } from 'os';
import { join } from 'path';
import { token_set_ratio, extract } from 'fuzzball';
import { spawn } from 'node:child_process';
import 'colors';

const MODEL_PATH = "model";
const SAMPLE_RATE = 16000;

// NOTE Deps:
// https://github.com/bahamas10/hue-cli
// npm i -g hue-cli


const CURRENT_LAMP = 'guļam istabas lampa';
const lightsActions = {
  "on": async () => await spawner('hue', ['lights', '2', 'on']),
  "off": async () => await spawner('hue', ['lights', '2', 'off'])
};

const lightsHandler = async (words) => {
  if (!words.length) return;
  const scores = extract(words, Object.keys(lightsActions), { scorer: token_set_ratio, returnObjects: true });

  const [likelyKeyword] = scores;
  if (likelyKeyword.score < 75) return;

  const action = lightsActions[likelyKeyword.choice];
  if (action) await action();
};


const PRIMARY_KEYWORD_HANDLERS = {
  "lights": lightsHandler,
};


const keywordOptions = { scorer: token_set_ratio, returnObjects: true };
const keywordChoices = Object.keys(PRIMARY_KEYWORD_HANDLERS);

const handler = async ({ text }) => {
  const [keyword, ...rest] = text.split(' ');
  if (!keyword.length) return;

  const [likelyKeyword] = extract(keyword, keywordChoices, keywordOptions);
  if (likelyKeyword.score < 75) return;

  const keywordHandler = PRIMARY_KEYWORD_HANDLERS[likelyKeyword.choice];
  if (keywordHandler) await keywordHandler(rest.join(' '));
};


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

  await setupHue();

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
    console.log(rec.finalResult());
    console.log("\nDone");
    rec.free();
    model.free();
  });
};

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

setImmediate(setup);
