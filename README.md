# Fieldtone

Fieldtone is an installable, offline-capable guitar tuner for standard E–A–D–G–B–E tuning. It uses your device microphone to detect pitch; no account or external service is required.

## Use on a phone

1. Deploy these static files to a site served over HTTPS. Microphone access and offline installation require a secure context; `localhost` also works for development.
2. Open the site on your phone and allow microphone access.
3. Choose **Auto** to have Fieldtone identify the plucked string, or **Manual** to choose a string yourself. Tap **Start tuning** and pluck that string; the tuner tells you to tune up or down and confirms when it is in tune.
4. Install it from the browser’s install option. On iPhone/iPad, use Safari’s **Share → Add to Home Screen**.

The app shell is cached on the first visit and can then open offline. Microphone access is still provided by the device and browser, so it may require permission again after browser settings are cleared.
# g-tuner
