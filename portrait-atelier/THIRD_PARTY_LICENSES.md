# Third-party licences — Portrait Atelier

This file records third-party software and AI models
used by the Portrait Atelier application.

## U²-Netp

Purpose: Foreground segmentation and background removal.

Original authors: Xuebin Qin, Zichen Zhang,
Chenyang Huang, Masood Dehghan,
Osmar Zaiane and Martin Jagersand.

Licence: Apache License 2.0.

Source:
https://github.com/xuebinqin/U-2-Net

ONNX model:
https://huggingface.co/nfa04/u2netp-onnx

SHA-256:
309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8

The required Apache 2.0 licence text and any
applicable attribution notices must be retained
when distributing the model.

## ONNX Runtime Web

Purpose: Running AI models locally in the browser.

Licence: MIT.

Source:
https://github.com/microsoft/onnxruntime

## Konva

Purpose: Interactive canvas rendering.

Licence: MIT.

Source:
https://github.com/konvajs/konva

## Deployment checklist

- [ ] Include applicable third-party licence texts.
- [ ] Verify model files and checksums.
- [ ] Review bundled transitive dependencies.
- [ ] Verify the production model remains self-hosted.
- [ ] Test commercial deployment requirements.
- [ ] Test foreground quality on different animals.
- [ ] Test browser performance on desktop and mobile.
