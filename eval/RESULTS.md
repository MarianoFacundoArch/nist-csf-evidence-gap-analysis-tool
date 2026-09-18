# Experimental Results

_Grounding Generative AI in Authoritative Security Frameworks — measured data._
All numbers are produced by `eval/*.mjs` from real model runs. Corpus: `examples/sample-docs`; framework: NIST CSF 2.0 (106 Subcategories); retrieval: on-device MiniLM, top-k 6.

## 1. Model spectrum — fabrication vs. the verifier guarantee

`UQR` = fraction of the model's quotes that are NOT verbatim in the evidence (its fabrication signal). `delivered` = UQR AFTER the verifier (what reaches the user).

| Model | Type | Fabrication (UQR) | Parse-fail | Delivered UQR | Latency (med) | Coverage n/p/s/f |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| openai:gpt-4o-mini | cloud | 0.0% | 0/106 | 0.0% | 1634ms | 96/2/3/5 |
| openai:gpt-4o | cloud | 2.1% | 0/106 | 0.0% | 1024ms | 66/35/5/0 |
| openai:gpt-5.5 | cloud | 0.0% | 0/106 | 0.0% | 5096ms | 54/50/2/0 |
| ollama:qwen2.5:0.5b | local | 0.0% | 106/106 | 0.0% | 474ms | 0/0/0/0 |
| ollama:qwen2.5:1.5b | local | 0.0% | 77/106 | 0.0% | 920ms | 21/8/0/0 |
| ollama:qwen2.5:3b | local | 1.9% | 0/106 | 0.0% | 1313ms | 54/52/0/0 |
| ollama:llama3.2:3b | local | 11.8% | 0/106 | 0.0% | 1901ms | 98/8/0/0 |
| ollama:mistral:7b | local | 5.8% | 0/106 | 0.0% | 3835ms | 55/51/0/0 |
| ollama:qwen2.5:7b | local | 7.7% | 0/106 | 0.0% | 2450ms | 93/13/0/0 |
| ollama:llama3.1:8b | local | 17.7% | 0/106 | 0.0% | 3557ms | 16/90/0/0 |
| ollama:gemma2:9b | local | 0.0% | 0/106 | 0.0% | 4602ms | 34/72/0/0 |
| ollama:qwen2.5:14b | local | 7.2% | 0/106 | 0.0% | 6892ms | 38/66/2/0 |
| ollama:qwen2.5:32b | local | 0.0% | 0/106 | 0.0% | 15144ms | 28/78/0/0 |

**Averages:** cloud 0.7% · local (that parse) 5.8% · **delivered = 0.0% on all 13 models.**

Key findings: (1) the verifier drives delivered fabrication to **0% for every model**; (2) faithfulness is **family-driven, not size-driven** (Gemma-9B and Qwen-32B match the cloud frontier at 0%, while Llama models fabricate up to 17.7%); (3) the tiniest models fail at the **output format** (Qwen-0.5B: 106/106 unparseable); (4) even a strong cloud model (gpt-4o) fabricated 2.1%.

## 2. Adversarial robustness of the verifier

Crafted attacks (fabricated, paraphrase/substitution, cross-chunk splice, trivial words) vs. legitimate quotes (verbatim + formatting variants). 122 cases over 8 chunks.

- **Catch rate (adversarial dropped): 100.0%**
- **False-rejection (legit wrongly dropped): 0.0%**

| Category | Correct |
| --- | ---: |
| legit_verbatim | 100.0% (40/40) |
| legit_formatting | 100.0% (40/40) |
| adv_substitution | 100.0% (20/20) |
| adv_fabricated | 100.0% (5/5) |
| adv_trivial | 100.0% (5/5) |
| adv_crosschunk | 100.0% (12/12) |

## 3. Ablations — contribution of each safeguard

Re-processing the saved raw model outputs under different verifier configurations (642 raw quotes).

| Variant | Delivered hallucination | Note |
| --- | ---: | --- |
| full (deployed) | 0.0% | verbatim(NFC) + substantive bar |
| no_verifier | 4.7% | model raw quotes reach the user |
| no_substantive_bar | 0.0% | "0 trivial ""fake-anchor"" quotes would survive" |
| nfkc_normalization | 0.0% | 0 compatibility-fold escapes on real data |

On real data, removing the verifier lets **4.7%** of delivered quotes be fabricated (up to 17.7% per the worst model). The substantive-quote bar and NFC normalization show no effect on real data (models don't emit trivial/compatibility-fold quotes) but are proven necessary by the adversarial benchmark above.

## 4. Reasoning-effort sweep (gpt-5.5)

| reasoning_effort | Fabrication (UQR) | Delivered UQR | Latency (med) | Est. output tokens |
| --- | ---: | ---: | ---: | ---: |
| low | 0.0% | 0.0% | 5614ms | 7506 |
| medium | 0.0% | 0.0% | 10158ms | 7034 |
| high | 0.0% | 0.0% | 12390ms | 6920 |

---
Files: `eval/results-spectrum/` (summary.csv + per-model items_*.csv + raw_*.jsonl), `eval/results-adversarial/`, `eval/results-ablations/`, `eval/results-reasoning-*/`.
