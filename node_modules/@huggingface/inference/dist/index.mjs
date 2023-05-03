// src/utils/toArray.ts
function toArray(obj) {
  if (Array.isArray(obj)) {
    return obj;
  }
  return [obj];
}

// src/vendor/fetch-event-source/parse.ts
function getLines(onLine) {
  let buffer;
  let position;
  let fieldLength;
  let discardTrailingNewline = false;
  return function onChunk(arr) {
    if (buffer === void 0) {
      buffer = arr;
      position = 0;
      fieldLength = -1;
    } else {
      buffer = concat(buffer, arr);
    }
    const bufLength = buffer.length;
    let lineStart = 0;
    while (position < bufLength) {
      if (discardTrailingNewline) {
        if (buffer[position] === 10 /* NewLine */) {
          lineStart = ++position;
        }
        discardTrailingNewline = false;
      }
      let lineEnd = -1;
      for (; position < bufLength && lineEnd === -1; ++position) {
        switch (buffer[position]) {
          case 58 /* Colon */:
            if (fieldLength === -1) {
              fieldLength = position - lineStart;
            }
            break;
          case 13 /* CarriageReturn */:
            discardTrailingNewline = true;
          case 10 /* NewLine */:
            lineEnd = position;
            break;
        }
      }
      if (lineEnd === -1) {
        break;
      }
      onLine(buffer.subarray(lineStart, lineEnd), fieldLength);
      lineStart = position;
      fieldLength = -1;
    }
    if (lineStart === bufLength) {
      buffer = void 0;
    } else if (lineStart !== 0) {
      buffer = buffer.subarray(lineStart);
      position -= lineStart;
    }
  };
}
function getMessages(onId, onRetry, onMessage) {
  let message = newMessage();
  const decoder = new TextDecoder();
  return function onLine(line, fieldLength) {
    if (line.length === 0) {
      onMessage?.(message);
      message = newMessage();
    } else if (fieldLength > 0) {
      const field = decoder.decode(line.subarray(0, fieldLength));
      const valueOffset = fieldLength + (line[fieldLength + 1] === 32 /* Space */ ? 2 : 1);
      const value = decoder.decode(line.subarray(valueOffset));
      switch (field) {
        case "data":
          message.data = message.data ? message.data + "\n" + value : value;
          break;
        case "event":
          message.event = value;
          break;
        case "id":
          onId(message.id = value);
          break;
        case "retry":
          const retry = parseInt(value, 10);
          if (!isNaN(retry)) {
            onRetry(message.retry = retry);
          }
          break;
      }
    }
  };
}
function concat(a, b) {
  const res = new Uint8Array(a.length + b.length);
  res.set(a);
  res.set(b, a.length);
  return res;
}
function newMessage() {
  return {
    data: "",
    event: "",
    id: "",
    retry: void 0
  };
}

// src/HfInference.ts
var HF_INFERENCE_API_BASE_URL = "https://api-inference.huggingface.co/models/";
var TextGenerationStreamFinishReason = /* @__PURE__ */ ((TextGenerationStreamFinishReason2) => {
  TextGenerationStreamFinishReason2["Length"] = "length";
  TextGenerationStreamFinishReason2["EndOfSequenceToken"] = "eos_token";
  TextGenerationStreamFinishReason2["StopSequence"] = "stop_sequence";
  return TextGenerationStreamFinishReason2;
})(TextGenerationStreamFinishReason || {});
var HfInference = class {
  apiKey;
  defaultOptions;
  constructor(apiKey = "", defaultOptions = {}) {
    this.apiKey = apiKey;
    this.defaultOptions = defaultOptions;
  }
  /**
   * Tries to fill in a hole with a missing word (token to be precise). That’s the base task for BERT models.
   */
  async fillMask(args, options) {
    const res = await this.request(args, options);
    const isValidOutput = Array.isArray(res) && res.every(
      (x) => typeof x.score === "number" && typeof x.sequence === "string" && typeof x.token === "number" && typeof x.token_str === "string"
    );
    if (!isValidOutput) {
      throw new TypeError(
        "Invalid inference output: output must be of type Array<score: number, sequence:string, token:number, token_str:string>"
      );
    }
    return res;
  }
  /**
   * This task is well known to summarize longer text into shorter text. Be careful, some models have a maximum length of input. That means that the summary cannot handle full books for instance. Be careful when choosing your model.
   */
  async summarization(args, options) {
    const res = await this.request(args, options);
    const isValidOutput = Array.isArray(res) && res.every((x) => typeof x.summary_text === "string");
    if (!isValidOutput) {
      throw new TypeError("Invalid inference output: output must be of type Array<summary_text: string>");
    }
    return res?.[0];
  }
  /**
   * Want to have a nice know-it-all bot that can answer any question?. Recommended model: deepset/roberta-base-squad2
   */
  async questionAnswer(args, options) {
    const res = await this.request(args, options);
    const isValidOutput = typeof res.answer === "string" && typeof res.end === "number" && typeof res.score === "number" && typeof res.start === "number";
    if (!isValidOutput) {
      throw new TypeError(
        "Invalid inference output: output must be of type <answer: string, end: number, score: number, start: number>"
      );
    }
    return res;
  }
  /**
   * Don’t know SQL? Don’t want to dive into a large spreadsheet? Ask questions in plain english! Recommended model: google/tapas-base-finetuned-wtq.
   */
  async tableQuestionAnswer(args, options) {
    const res = await this.request(args, options);
    const isValidOutput = typeof res.aggregator === "string" && typeof res.answer === "string" && Array.isArray(res.cells) && res.cells.every((x) => typeof x === "string") && Array.isArray(res.coordinates) && res.coordinates.every((coord) => Array.isArray(coord) && coord.every((x) => typeof x === "number"));
    if (!isValidOutput) {
      throw new TypeError(
        "Invalid inference output: output must be of type <aggregator: string, answer: string, cells: string[], coordinates: number[][]>"
      );
    }
    return res;
  }
  /**
   * Usually used for sentiment-analysis this will output the likelihood of classes of an input. Recommended model: distilbert-base-uncased-finetuned-sst-2-english
   */
  async textClassification(args, options) {
    const res = (await this.request(args, options))?.[0];
    const isValidOutput = Array.isArray(res) && res.every((x) => typeof x.label === "string" && typeof x.score === "number");
    if (!isValidOutput) {
      throw new TypeError("Invalid inference output: output must be of type Array<label: string, score: number>");
    }
    return res;
  }
  /**
   * Use to continue text from a prompt. This is a very generic task. Recommended model: gpt2 (it’s a simple model, but fun to play with).
   */
  async textGeneration(args, options) {
    const res = await this.request(args, options);
    const isValidOutput = Array.isArray(res) && res.every((x) => typeof x.generated_text === "string");
    if (!isValidOutput) {
      throw new TypeError("Invalid inference output: output must be of type Array<generated_text: string>");
    }
    return res?.[0];
  }
  /**
   * Use to continue text from a prompt. Same as `textGeneration` but returns generator that can be read one token at a time
   */
  async *textGenerationStream(args, options) {
    yield* this.streamingRequest(args, options);
  }
  /**
   * Usually used for sentence parsing, either grammatical, or Named Entity Recognition (NER) to understand keywords contained within text. Recommended model: dbmdz/bert-large-cased-finetuned-conll03-english
   */
  async tokenClassification(args, options) {
    const res = toArray(await this.request(args, options));
    const isValidOutput = Array.isArray(res) && res.every(
      (x) => typeof x.end === "number" && typeof x.entity_group === "string" && typeof x.score === "number" && typeof x.start === "number" && typeof x.word === "string"
    );
    if (!isValidOutput) {
      throw new TypeError(
        "Invalid inference output: output must be of type Array<end: number, entity_group: string, score: number, start: number, word: string>"
      );
    }
    return res;
  }
  /**
   * This task is well known to translate text from one language to another. Recommended model: Helsinki-NLP/opus-mt-ru-en.
   */
  async translation(args, options) {
    const res = await this.request(args, options);
    const isValidOutput = Array.isArray(res) && res.every((x) => typeof x.translation_text === "string");
    if (!isValidOutput) {
      throw new TypeError("Invalid inference output: output must be of type Array<translation_text: string>");
    }
    return res?.[0];
  }
  /**
   * This task is super useful to try out classification with zero code, you simply pass a sentence/paragraph and the possible labels for that sentence, and you get a result. Recommended model: facebook/bart-large-mnli.
   */
  async zeroShotClassification(args, options) {
    const res = toArray(
      await this.request(args, options)
    );
    const isValidOutput = Array.isArray(res) && res.every(
      (x) => Array.isArray(x.labels) && x.labels.every((_label) => typeof _label === "string") && Array.isArray(x.scores) && x.scores.every((_score) => typeof _score === "number") && typeof x.sequence === "string"
    );
    if (!isValidOutput) {
      throw new TypeError(
        "Invalid inference output: output must be of type Array<labels: string[], scores: number[], sequence: string>"
      );
    }
    return res;
  }
  /**
   * This task corresponds to any chatbot like structure. Models tend to have shorter max_length, so please check with caution when using a given model if you need long range dependency or not. Recommended model: microsoft/DialoGPT-large.
   *
   */
  async conversational(args, options) {
    const res = await this.request(args, options);
    const isValidOutput = Array.isArray(res.conversation.generated_responses) && res.conversation.generated_responses.every((x) => typeof x === "string") && Array.isArray(res.conversation.past_user_inputs) && res.conversation.past_user_inputs.every((x) => typeof x === "string") && typeof res.generated_text === "string" && Array.isArray(res.warnings) && res.warnings.every((x) => typeof x === "string");
    if (!isValidOutput) {
      throw new TypeError(
        "Invalid inference output: output must be of type <conversation: {generated_responses: string[], past_user_inputs: string[]}, generated_text: string, warnings: string[]>"
      );
    }
    return res;
  }
  /**
   * This task reads some text and outputs raw float values, that are usually consumed as part of a semantic database/semantic search.
   */
  async featureExtraction(args, options) {
    const res = await this.request(args, options);
    return res;
  }
  /**
   * This task reads some audio input and outputs the said words within the audio files.
   * Recommended model (english language): facebook/wav2vec2-large-960h-lv60-self
   */
  async automaticSpeechRecognition(args, options) {
    const res = await this.request(args, {
      ...options,
      binary: true
    });
    const isValidOutput = typeof res.text === "string";
    if (!isValidOutput) {
      throw new TypeError("Invalid inference output: output must be of type <text: string>");
    }
    return res;
  }
  /**
   * This task reads some audio input and outputs the likelihood of classes.
   * Recommended model:  superb/hubert-large-superb-er
   */
  async audioClassification(args, options) {
    const res = await this.request(args, {
      ...options,
      binary: true
    });
    const isValidOutput = Array.isArray(res) && res.every((x) => typeof x.label === "string" && typeof x.score === "number");
    if (!isValidOutput) {
      throw new TypeError("Invalid inference output: output must be of type Array<label: string, score: number>");
    }
    return res;
  }
  /**
   * This task reads some image input and outputs the likelihood of classes.
   * Recommended model: google/vit-base-patch16-224
   */
  async imageClassification(args, options) {
    const res = await this.request(args, {
      ...options,
      binary: true
    });
    const isValidOutput = Array.isArray(res) && res.every((x) => typeof x.label === "string" && typeof x.score === "number");
    if (!isValidOutput) {
      throw new TypeError("Invalid inference output: output must be of type Array<label: string, score: number>");
    }
    return res;
  }
  /**
   * This task reads some image input and outputs the likelihood of classes & bounding boxes of detected objects.
   * Recommended model: facebook/detr-resnet-50
   */
  async objectDetection(args, options) {
    const res = await this.request(args, {
      ...options,
      binary: true
    });
    const isValidOutput = Array.isArray(res) && res.every(
      (x) => typeof x.label === "string" && typeof x.score === "number" && typeof x.box.xmin === "number" && typeof x.box.ymin === "number" && typeof x.box.xmax === "number" && typeof x.box.ymax === "number"
    );
    if (!isValidOutput) {
      throw new TypeError(
        "Invalid inference output: output must be of type Array<{label:string; score:number; box:{xmin:number; ymin:number; xmax:number; ymax:number}}>"
      );
    }
    return res;
  }
  /**
   * This task reads some image input and outputs the likelihood of classes & bounding boxes of detected objects.
   * Recommended model: facebook/detr-resnet-50-panoptic
   */
  async imageSegmentation(args, options) {
    const res = await this.request(args, {
      ...options,
      binary: true
    });
    const isValidOutput = Array.isArray(res) && res.every((x) => typeof x.label === "string" && typeof x.mask === "string" && typeof x.score === "number");
    if (!isValidOutput) {
      throw new TypeError(
        "Invalid inference output: output must be of type Array<label: string, mask: string, score: number>"
      );
    }
    return res;
  }
  /**
   * This task reads some text input and outputs an image.
   * Recommended model: stabilityai/stable-diffusion-2
   */
  async textToImage(args, options) {
    const res = await this.request(args, {
      ...options,
      blob: true
    });
    const isValidOutput = res && res instanceof Blob;
    if (!isValidOutput) {
      throw new TypeError("Invalid inference output: output must be of type object & of instance Blob");
    }
    return res;
  }
  /**
   * This task reads some image input and outputs the text caption.
   */
  async imageToText(args, options) {
    return (await this.request(args, {
      ...options,
      binary: true
    }))?.[0];
  }
  /**
   * Helper that prepares request arguments
   */
  makeRequestOptions(args, options) {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const { model, ...otherArgs } = args;
    const headers = {};
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    if (!options?.binary) {
      headers["Content-Type"] = "application/json";
    }
    if (options?.binary) {
      if (mergedOptions.wait_for_model) {
        headers["X-Wait-For-Model"] = "true";
      }
      if (mergedOptions.use_cache === false) {
        headers["X-Use-Cache"] = "false";
      }
      if (mergedOptions.dont_load_model) {
        headers["X-Load-Model"] = "0";
      }
    }
    const url = `${HF_INFERENCE_API_BASE_URL}${model}`;
    const info = {
      headers,
      method: "POST",
      body: options?.binary ? args.data : JSON.stringify({
        ...otherArgs,
        options: mergedOptions
      }),
      credentials: options?.includeCredentials ? "include" : "same-origin"
    };
    return { url, info, mergedOptions };
  }
  async request(args, options) {
    const { url, info, mergedOptions } = this.makeRequestOptions(args, options);
    const response = await fetch(url, info);
    if (mergedOptions.retry_on_error !== false && response.status === 503 && !mergedOptions.wait_for_model) {
      return this.request(args, {
        ...mergedOptions,
        wait_for_model: true
      });
    }
    if (options?.blob) {
      if (!response.ok) {
        throw new Error("An error occurred while fetching the blob");
      }
      return await response.blob();
    }
    const output = await response.json();
    if (output.error) {
      throw new Error(output.error);
    }
    return output;
  }
  /**
   * Make request that uses server-sent events and returns response as a generator
   */
  async *streamingRequest(args, options) {
    const { url, info, mergedOptions } = this.makeRequestOptions({ ...args, stream: true }, options);
    const response = await fetch(url, info);
    if (mergedOptions.retry_on_error !== false && response.status === 503 && !mergedOptions.wait_for_model) {
      return this.streamingRequest(args, {
        ...mergedOptions,
        wait_for_model: true
      });
    }
    if (!response.ok) {
      if (response.headers.get("Content-Type")?.startsWith("application/json")) {
        const output = await response.json();
        if (output.error) {
          throw new Error(output.error);
        }
      }
      throw new Error(`Server response contains error: ${response.status}`);
    }
    if (response.headers.get("content-type") !== "text/event-stream") {
      throw new Error(
        `Server does not support event stream content type, it returned ` + response.headers.get("content-type")
      );
    }
    if (!response.body) {
      return;
    }
    const reader = response.body.getReader();
    let events = [];
    const onEvent = (event) => {
      events.push(event);
    };
    const onChunk = getLines(
      getMessages(
        () => {
        },
        () => {
        },
        onEvent
      )
    );
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done)
          return;
        onChunk(value);
        for (const event of events) {
          if (event.data.length > 0) {
            yield JSON.parse(event.data);
          }
        }
        events = [];
      }
    } finally {
      reader.releaseLock();
    }
  }
};
export {
  HfInference,
  TextGenerationStreamFinishReason
};
