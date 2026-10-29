# Собирает src/wsp_data.js: коэффициенты IF-97 (из iapws, IAPWS-IF97) и NASA-полиномы газов (из Cantera nasa_gas.yaml).
import json, sys
c = json.load(open('tools/if97c.json'))
keep = ['Region1_Li','Region1_Lj','Region1_n','Region2_Li','Region2_Lj','Region2_n','Region2_cp0_Jo','Region2_cp0_no','Region2_cp0_no_meta',
        'Region2_Ir_m','Region2_Jr_m','Region2_nr_m','Region3_Li','Region3_Lj','Region3_n','Region5_Li','Region5_Lj','Region5_n','Region5_cp0_Jo','Region5_cp0_no',
        'h13_s_Li','h13_s_Lj','h13_s_n','Backward4_T_hs_Li','Backward4_T_hs_Lj','Backward4_T_hs_n','t_hs_Li','t_hs_Lj','t_hs_n']
d = {k: c[k] for k in keep}
src = '// Данные для wsp.js (сгенерировано tools/gen_wsp_data.py — не править вручную).\n' \
      '// IF-97: IAPWS Industrial Formulation 1997 (коэффициенты по пакету iapws).\n' \
      '(function (root) {\nconst D = ' + json.dumps({'if97': d}, separators=(',', ':')) + ';\n' \
      "if (typeof module !== 'undefined' && module.exports) module.exports = D; else root.MatWSPData = D;\n})(typeof window !== 'undefined' ? window : globalThis);\n"
open('src/wsp_data.js', 'w').write(src)
print(len(src))
