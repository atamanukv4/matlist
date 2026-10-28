// Шапка пустого листа, сохранённого самим Mathcad 15 (формат 0). Mathcad строго проверяет .xmcd по схеме,
// поэтому шапка не урезается; подставляются только идентификаторы и настройки результатов/ORIGIN.
(function (root) {
const HEAD = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<?validation-md5-digest 57bf2b0c30e127085e60eab54eb356a3?>
<worksheet version="3.0.3" xmlns="http://schemas.mathsoft.com/worksheet30" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:ws="http://schemas.mathsoft.com/worksheet30" xmlns:ml="http://schemas.mathsoft.com/math30" xmlns:u="http://schemas.mathsoft.com/units10" xmlns:p="http://schemas.mathsoft.com/provenance10">
	<pointReleaseData/>
	<metadata>
		<generator>Mathcad Professional 14.1</generator>
		<userData>
			<title>{{TITLE}}</title>
			<description/>
			<author>Матлист</author>
			<company/>
			<keywords/>
			<revisedBy>Матлист</revisedBy>
		</userData>
		<identityInfo>
			<revision>1</revision>
			<documentID>{{DOCID}}</documentID>
			<versionID>{{VERID}}</versionID>
			<parentVersionID>00000000-0000-0000-0000-000000000000</parentVersionID>
			<branchID>00000000-0000-0000-0000-000000000000</branchID>
		</identityInfo>
	</metadata>
	<settings>
		<presentation>
			<textRendering>
				<textStyles>
					<textStyle name="Обычный">
						<blockAttr margin-left="0" margin-right="0" text-indent="0" text-align="left" list-style-type="none" tabs="inherit"/>
						<inlineAttr font-family="Arial" font-charset="0" font-size="10" font-weight="normal" font-style="normal" underline="false" line-through="false" vertical-align="baseline"/>
					</textStyle>
				</textStyles>
			</textRendering>
			<mathRendering equation-color="#000">
				<operators multiplication="dot" derivative="derivative" literal-subscript="small" definition="colon-equal" global-definition="triple-equal" local-definition="left-arrow" equality="bold-equal" symbolic-evaluation="right-arrow"/>
				<mathStyles>
					<mathStyle name="Переменные" font-family="Times New Roman" font-charset="0" font-size="10" font-weight="normal" font-style="normal" underline="false"/>
					<mathStyle name="Константы" font-family="Times New Roman" font-charset="0" font-size="10" font-weight="normal" font-style="normal" underline="false"/>
					<mathStyle name="Пользовательский 1" font-family="Arial" font-charset="0" font-size="10" font-weight="normal" font-style="normal" underline="false"/>
					<mathStyle name="Пользовательский 2" font-family="Courier New" font-charset="0" font-size="10" font-weight="normal" font-style="normal" underline="false"/>
					<mathStyle name="Пользовательский 3" font-family="Arial" font-charset="0" font-size="10" font-weight="normal" font-style="normal" underline="false"/>
					<mathStyle name="Пользовательский 4" font-family="Times New Roman" font-charset="0" font-size="10" font-weight="normal" font-style="normal" underline="false"/>
					<mathStyle name="Пользовательский 5" font-family="Times New Roman" font-charset="0" font-size="10" font-weight="normal" font-style="normal" underline="false"/>
					<mathStyle name="Пользовательский 6" font-family="Arial" font-charset="0" font-size="10" font-weight="normal" font-style="normal" underline="false"/>
					<mathStyle name="Пользовательский 7" font-family="Times New Roman" font-charset="0" font-size="10" font-weight="normal" font-style="normal" underline="false"/>
					<mathStyle name="Шрифт математического текста" font-family="Times New Roman" font-charset="0" font-size="14" font-weight="normal" font-style="normal" underline="false"/>
				</mathStyles>
				<dimensionNames mass="масса" length="длина" time="время" current="сила тока" thermodynamic-temperature="температура" luminous-intensity="сила света" amount-of-substance="количество вещества" display="false"/>
				<symbolics derivation-steps-style="vertical-insert" show-comments="false" evaluate-in-place="false"/>
				<results numeric-only="true">
					<general precision="{{PREC}}" show-trailing-zeros="false" radix="dec" complex-threshold="10" zero-threshold="15" imaginary-value="{{IMAG}}" exponential-threshold="{{EXPTHR}}"/>
					<matrix display-style="auto" expand-nested-arrays="false"/>
					<unit format-units="false" simplify-units="false" fractional-unit-exponent="false"/>
				</results>
			</mathRendering>
			<pageModel show-page-frame="false" show-header-frame="false" show-footer-frame="false" header-footer-start-page="1" paper-code="9" orientation="portrait" print-single-page-width="false" page-width="595.3" page-height="841.9">
				<margins left="56.7" right="42.5" top="56.7" bottom="56.7"/>
				<header use-full-page-width="false"/>
				<footer use-full-page-width="false"/>
			</pageModel>
			<colorModel background-color="#fff" default-highlight-color="#ffff80"/>
			<language math="ru" UI="ru"/>
		</presentation>
		<calculation>
			<builtInVariables array-origin="{{ORIGIN}}" convergence-tolerance="0.001" constraint-tolerance="0.001" random-seed="1" prn-precision="4" prn-col-width="8"/>
			<calculationBehavior automatic-recalculation="true" matrix-strict-singularity-check="false" optimize-expressions="false" exact-boolean="true" strings-use-origin="false" zero-over-zero="error">
				<compatibility multiple-assignment="MC12" local-assignment="MC11"/>
			</calculationBehavior>
			<units>
				<currentUnitSystem name="si" customized="false"/>
			</units>
		</calculation>
		<editor view-annotations="false" view-regions="false">
			<ruler is-visible="false" ruler-unit="in"/>
			<grid granularity-x="1" granularity-y="1"/>
		</editor>
		<fileFormat image-type="image/png" image-quality="75" save-numeric-results="true" exclude-large-results="true" save-text-images="false" screen-dpi="96"/>
		<miscellaneous>
			<handbook handbook-region-tag-ub="0" can-delete-original-handbook-regions="true" can-delete-user-regions="true" can-print="true" can-copy="true" can-save="true" file-permission-mask="0"/>
		</miscellaneous>
	</settings>
	<regions>
`;
const TAIL = `	</regions>
</worksheet>
`;
const api = { HEAD, TAIL };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MatXmcdTemplate = api;
})(typeof self !== 'undefined' ? self : this);
