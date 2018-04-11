import * as React from 'react';

const d3Scale = require('d3-scale');
const R = require('ramda');
import d3Format = require('d3-format');

export const A = ({href, children, style}) => <a style={R.merge({color: 'black'}, style)} href={href}>{children}</a>;

export const TABLE = ({children}) => <table width="100%" style={{
    backgroundColor: 'white',
    tableLayout: 'fixed',
    minWidth: '1000px',
    maxWidth: '1200px',
    borderCollapse: 'collapse'
}}>
    {children}
</table>;

export const THEAD = ({children, style}) => <thead>
<tr style={R.merge({color: '#eee', textAlign: 'left', backgroundColor: 'black', height: '4ex'}, style)}>
    {children}
</tr>
</thead>;

export const newColumn = (value, cols) => ({
    value,
    td: (s, options?) => R.pipe(
        R.chain(c => c.cols),
        R.map(c => <td style={{height: '4ex'}} title={c.title(s)}>{c.content(s, options)}</td>)
    )(cols),
    th: () => cols.map(c => <th colSpan={c.cols.length}>{c.label}</th>),
    colgroup: () => <colgroup>
        {
            R.pipe(
                R.chain(c => c.cols),
                R.addIndex(R.map)((c, i) => <col span="1" style={c.style}/>)
            )(cols)
        }
    </colgroup>
});

let title = (metric) => s => `
Change: ${d3Format.format('0.1f')(s.metrics[metric].stdChange)} σ
Change: ${d3Format.format('0.0%')(s.metrics[metric].change)}
SLevel: ${getSeverityLevel(s.metrics[metric].stdChange, s.metrics[metric].change)}`;

export const makeColumn = metricToLabel => (metric, scale, format) => newColumn(
    metric,
    [
        {
            label: metricToLabel(metric), cols: [
                {
                    style: {width: '10%'},
                    title: title(metric),
                    content: (s, options) => ChangeSymbol(scale)(
                        s.metrics[metric].stdChange,
                        s.metrics[metric].change,
                        format(s.metrics[metric].actual), options
                    )
                }
            ]
        }
    ]
);

export const newMakeUrl = ({dateFrom, dateTo}) => {
    /* TODO: links here should follow this format to allow authentication:
     http://sigma.sam-media.com/daily_reports_archive/${yesterday}/?username=${username}&exp_ts=${tomorrow}&hash=${signature(username,tomorrow)(process.env.secret)}

     the signature function can be imported from ./hash.ts
     username can be passed as props (best case scenario)
    */
    const makeUrl = (filter, breakdown) => `http://sigma.sam-media.com/filter_page_section_row/${dateFrom}/${dateTo}/${filter}/${breakdown}/`;
    return {
        makeUrl,
        makeCountrySummaryUrl: (country_code) => makeUrl(`country_code=${country_code}`, `-/-/day`),
        makeAffiliateSummaryUrl: (country_code, affiliate_id) => makeUrl(`country_code=${country_code},affiliate_id=${affiliate_id}`, `-/-/day`),
        makeHandleSummaryUrl: (country_code, handle_name) => makeUrl(`country_code=${country_code},handle_name=${handle_name}`, `-/-/day`)
    }
};

const getSeverityLevel = (function () {
    let t = y => Math.log(y + 1) / Math.log(2);

    let levelf = (a, b) => (s, r) => Math.pow((s - 1) / (a - 1), 2) + Math.pow(t(r / b), 2) > 1;

    let as = [0, 2.3, 3, 4, 5, 6]; // [0, 2.3, 3.0, 4.0, 5.0, 6.0]
    let bs = [0, 2.8, 3.2, 4.0, 5.0, 6.0]; // [0, 1.0, 1.5, 2.0, 3.2, 6.4]
    let severity = [0, 1, 2, 3, 4, 5];

    let levels = R.pipe(
        R.map(([a, b, severity]) => ({
            severity,
            f: levelf(a, b)
        })),
        R.reverse
    )(R.zipWith(
        (xs, x) => xs.concat([x]),
        R.zip(as, bs),
        severity)
    );

    return (s, r) => {
        if (Math.abs(s) <= 1) {
            return 0;
        } else {
            let l = levels.find(lev => lev.f(Math.abs(s), r == -1 ? 1000 : r < 0 ? 1 / (1 - Math.abs(r)) : r));
            return l && l.severity ? l.severity : 5;
        }
    }
})();

export const {ChangeSymbol, positiveColorScale, negativeColorScale, neutralColorScale} = (function () {
    const colorScale = (domain, colors) => v => v == 0 ? 'white' : d3Scale.scaleQuantize().domain(domain).range(colors)(Math.abs(v));

    const greens = colorScale([1, 5], ['#CBE7C1', '#BBDFB3', '#A5D19C', '#77BD65', '#54AE3D']);
    const reds = colorScale([1, 5], ['#F7BBBB', '#F7A5A9', '#F4777D', '#EE4B4C', '#E22124']);
    const positiveColorScale = v => v < 0 ? reds(v) : greens(v);
    const negativeColorScale = v => v < 0 ? greens(v) : reds(v);
    const neutralColorScale = colorScale(R.range(2, 7), ['#FAD1BD', '#FFCAAF', '#FAA27C', '#EF8656', '#FB6123']);

    const ChangeSymbolSpan = ({style, children}) => <span style={R.merge({
        display: 'inline-block',
        overflow: 'hidden',
        minWidth: '4em',
        maxWidth: '100%',
        float: 'left',
        padding: '0.15em 0em'
    }, style)}>&nbsp;{children}&nbsp;</span>;

    const ChangeSymbol =
        (scale, format = v => Math.round(Math.abs(v)) + (v > 0 ? '+' : '-')) => (stdChange, change, content, options = {ignoreBgColor: false}) => {
            let severity = getSeverityLevel(stdChange, change);
            let bgColor = options.ignoreBgColor ? '' : scale(severity * (stdChange > 0 ? 1 : -1));
            let textColor = 'black';
            if (bgColor == '#54AE3D' || bgColor == '#77BD65' || bgColor == '#E22124' || bgColor == '#EE4B4C') {
                textColor = 'white';
            }

            if (Math.abs(stdChange) < 1 || Math.abs(change) < 0.075) {
                return <ChangeSymbolSpan>{content}</ChangeSymbolSpan>;
            } else {
                return <ChangeSymbolSpan style={{
                    backgroundColor: bgColor,
                    color: textColor,
                    borderRadius: '0.5em'
                }}>{content}</ChangeSymbolSpan>;
            }
        };

    return {ChangeSymbol, positiveColorScale, negativeColorScale, neutralColorScale}
})();
