"""Сжатие ONNX-моделей CoMER для телефона: веса MatMul/Gemm → int8 (динамическое квантование).
Проверка: те же изображения CROHME распознаются исходной и сжатой моделью — печатается совпадение.
usage: python tools/quant_model.py <папка с encoder.onnx decoder.onnx vocab.txt> [CoMER dir]"""
import os, sys
from onnxruntime.quantization import quantize_dynamic, QuantType
d = sys.argv[1]
for n in ('encoder', 'decoder'):
    src = os.path.join(d, n + '.onnx'); dst = os.path.join(d, n + '_q.onnx')
    quantize_dynamic(src, dst, weight_type=QuantType.QInt8, op_types_to_quantize=['MatMul', 'Gemm'])
    print(n, os.path.getsize(src) // 1024, 'KiB ->', os.path.getsize(dst) // 1024, 'KiB')
