# Извлекает массивы коэффициентов IF-97 из _iapws97Constants.py (без исполнения кода) в JSON.
import ast, json, sys
src = open(sys.argv[1], encoding='utf-8').read()
out = {}
for node in ast.parse(src).body:
    if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
        v = node.value
        if isinstance(v, ast.Call) and getattr(v.func, 'attr', '') == 'array' and v.args:
            try: out[node.targets[0].id] = ast.literal_eval(v.args[0])
            except Exception: pass
json.dump(out, open(sys.argv[2], 'w'))
print(len(out), sorted(out)[:200])
