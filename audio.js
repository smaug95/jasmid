var sampleRate = 44100; /* hard-coded in Flash player */

var audioContext;
var AudioContextClass = (window.AudioContext ||
                         window.webkitAudioContext ||
                         window.mozAudioContext ||
                         window.oAudioContext ||
                         window.msAudioContext);

/**
 * Use this getter function to benefit from lazy instantiation. This is important in mobile safari where the
 * AudioContext has to be constructed in response to a user event.
 */
function getAudioContext() {
	if (AudioContextClass && !audioContext) {
        audioContext = new AudioContextClass();
	}
	return audioContext;
}

function AudioPlayer(generator, opts, stopObject, stopCallback) {
	if (!opts) opts = {};
	if (!stopObject) stopObject = {};
	if (!stopCallback) stopCallback = function () {};

	var latency = opts.latency || 1;
	var checkInterval = latency * 100; /* in ms */

	var audioElement = new Audio();
	var requestStop = false;

	if (audioElement.mozSetup) {
		audioElement.mozSetup(2, sampleRate); /* channels, sample rate */

		var buffer = []; /* data generated but not yet written */
		var minBufferLength = latency * 2 * sampleRate; /* refill buffer when there are only this many elements remaining */
		var bufferFillLength = Math.floor(latency * sampleRate);

		function checkBuffer() {
			if (buffer.length) {
				var written = audioElement.mozWriteAudio(buffer);
				buffer = buffer.slice(written);
			}
			if (buffer.length < minBufferLength && !generator.finished) {
				buffer = buffer.concat(generator.generate(bufferFillLength));
			}
			if (!requestStop && (!generator.finished || buffer.length)) {
				setTimeout(checkBuffer, checkInterval);
			} else {
			    stopCallback.call(stopObject);
			}
		}
		checkBuffer();

		return {
			'type': 'Firefox Audio',
			'stop': function() {
				requestStop = true;
			}
		}
	} else if (AudioContextClass) {
		// Uses Webkit Web Audio API if available
		var audioContext = getAudioContext();
		sampleRate = audioContext.sampleRate;

		var channelCount = 2;
		var bufferSize = 4096*4; // Higher for less gitches, lower for less latency

		var node = audioContext.createScriptProcessor(bufferSize, 0, channelCount);

		node.onaudioprocess = process;

		function process(e) {
			if (generator.finished) {
				node.disconnect();
				stopCallback.call(stopObject);
				return;
			}

			var dataLeft = e.outputBuffer.getChannelData(0);
			var dataRight = e.outputBuffer.getChannelData(1);

			var generate = generator.generate(bufferSize);

			for (var i = 0; i < bufferSize; ++i) {
				dataLeft[i] = generate[i*2];
				dataRight[i] = generate[i*2+1];
			}
		}

		// start
		node.connect(audioContext.destination);

		return {
			'stop': function() {
				// pause
				node.disconnect();
				requestStop = true;
			},
			'type': 'Web Audio API'
		}

	} else {
		// Fall back to creating flash player
		var c = document.createElement('div');
		c.innerHTML = '<embed type="application/x-shockwave-flash" id="da-swf" src="da.swf" width="8" height="8" allowScriptAccess="always" style="position: fixed; left:-10px;" />';
		document.body.appendChild(c);
		var swf = document.getElementById('da-swf');

		var minBufferDuration = latency * 1000; /* refill buffer when there are only this many ms remaining */
		var bufferFillLength = latency * sampleRate;

		function write(data) {
			var out = new Array(data.length);
			for (var i = data.length-1; i != 0; i--) {
				out[i] = Math.floor(data[i]*32768);
			}
			return swf.write(out.join(' '));
		}

		function checkBuffer() {
			if (swf.bufferedDuration() < minBufferDuration) {
				write(generator.generate(bufferFillLength));
			};
			if (!requestStop && !generator.finished) setTimeout(checkBuffer, checkInterval);
		}

		function checkReady() {
			if (swf.write) {
				checkBuffer();
			} else {
				setTimeout(checkReady, 10);
			}
		}
		checkReady();

		return {
			'stop': function() {
				swf.stop();
				requestStop = true;
			},
			'bufferedDuration': function() {
				return swf.bufferedDuration();
			},
			'type': 'Flash Audio'
		}
	}
}
