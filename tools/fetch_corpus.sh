#!/bin/sh
# Публичные .xmcd с GitHub для проверки импорта и решателей (в репозиторий не кладутся — чужие файлы).
# ./tools/fetch_corpus.sh  →  corpus/web/*.xmcd ;  потом: node tools/check_xmcd.js corpus/web
set -e; cd "$(dirname "$0")/.."; mkdir -p corpus/web corpus/user
while IFS='|' read repo p; do
  repo=$(echo "$repo" | xargs); p=$(echo "$p" | sed 's/^ //'); [ -z "$repo" ] && continue
  enc=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$p")
  out="corpus/web/$(echo "${repo}__$(basename "$p")" | tr '/ ' '__')"
  [ -f "$out" ] || curl -sfL "https://raw.githubusercontent.com/$repo/HEAD/$enc" -o "$out" || echo "нет: $repo $p"
done <<'LIST'
ZherebinVR/University-MPEI | 5 семестр/Загрузки/1_3_4_zadania.xmcd
Valery-S/laboratory-works | 7 Семестр/ОТУ/Курсовая/КуРаГу.xmcd
KiLeXcs/study | 3 курс/БЖД/ЧС на ХОО.xmcd
KiLeXcs/study | 3 курс/БЖД/авария РОО.xmcd
sangheraio/CCMD | Sizing Calcs.xmcd
radixvinni/labs | Амосова О.А/Численные методы/LR6/6.3.xmcd
Seva74/TSU_TASKS | C++/Computational Mathematics/Выч_мат_3.xmcd
Seva74/TSU_TASKS | C++/Computational Mathematics/Выч_мат_1.xmcd
Ra1mun/Studying2.1 | ВычМат/lab_1.xmcd
Ra1mun/Studying2.1 | ВычМат/lab_2.xmcd
Ra1mun/Studying2.1 | ВычМат/lab_3.xmcd
Linhtetung/NumericalMethods | least_mean_sqr.xmcd
WhatKindOfPhrasesDoYouUse/Function_approximation_by_the_least_square_criterion | lab 6.xmcd
mariaisabelasn/UTFPR | Instrumentacao-Eletro-Eletronica/05 - filtros ativos/2 - planilhas/1ª_ordem - passa_alta.xmcd
VenerinnaWolf/uni-studies | Maths/Statistics/ДЗ4/ДЗ4.xmcd
mrgick/labs | 3_курс/mathcad/8/1.xmcd
grind-t/learn | university/mathcad-practice/Практика.xmcd
KhAlfred97/Simulation-of-the-movement-of-a-supersonic-aircraft | MathCad.xmcd
Kirill010/RTU-MIREA | 3 курс/5 семестр/Прикладные задачи нелинейной динамики/дз4/4.xmcd
Linhtetung/NumericalMethods | EulerMethod.xmcd
CallBan/ssau | 3 курс/1 семестр/Вычислительные методы/ЛР2.xmcd
AndreevAA/BMSTU | eduSem_3/fundamentalsOfElectronics/LR_3/Result/lab_03.xmcd
LDK28/BMSTU-IU7 | 3 семестр/Основы электроники/ЛР_1_10/lab_01.xmcd
Fergustinia/Study | 2 Курс/2 Курс/вычмат/1лаба/LABA1.xmcd
PasaOpasen/Old_Math_Projects | Оптимальное управление/Lab1.xmcd
Polina24zinoveva/3_course | Вычислительные_методы/ВМ2.xmcd
Arhetype/ChislMetod | lab8/Mat.xmcd
LIST
