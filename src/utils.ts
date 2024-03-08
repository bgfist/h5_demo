import * as _ from 'lodash';

export function assert(condition: boolean, msg: string) {
    if (!condition) {
        throw new Error(msg);
    }
}

export function filterEmpty<T>(t: T | null | undefined): t is T {
    return !!t;
}

export function second<T>(x: [unknown, T]) {
    return x[1];
}

export function groupByWith<T, K>(arr: T[], iteratee: (item: T) => K, compare: (a: K, b: K) => boolean) {
    return arr.reduce((map, item) => {
        const key = iteratee(item);
        let found = false;
        for (const [k] of map) {
            if (compare(k, key)) {
                map.get(k)!.push(item);
                found = true;
                break;
            }
        }
        if (!found) {
            map.set(key, [item]);
        }
        return map;
    }, new Map<K, T[]>());
}

export function groupWith<T>(arr: T[], compare: (a: T, b: T) => boolean) {
    return groupByWith(arr, _.identity, compare);
}

export function maxCountGroup<T>(grouped: _.Dictionary<T[]>) {
    return _.maxBy(_.toPairs(grouped), item => second(item).length)![0];
}

const TOLERANCE = 2;
export function numSame(num1: number, num2: number) {
    return Math.abs(num1 - num2) <= TOLERANCE;
}

export function R(strings: TemplateStringsArray, ...values: any[]) {
    // strings 是一个包含模板字符串静态部分的数组
    // values 是模板字符串中插入的表达式的值
    // 在这里可以添加自定义的逻辑来处理字符串和值
    let result = '';
    // 可以遍历 strings 数组和 values 数组来构建结果字符串
    for (let i = 0; i < strings.length; i++) {
        result += strings[i];
        if (i < values.length) {
            // 这里可以添加自定义的逻辑来处理每个值
            result += values[i];
        }
    }
    return result.replace(/(\s?\S+?-)(-?\d+)(\s|$)/g, function (substring: string, ...[$1, $2, $3]: any[]) {
        if ($2[0] === '-') {
            $2 = $2.substring(1);
            $1 = '-' + $1;
        } else if ($2[0] == 0) {
            return '';
        }
        return $1 + $2 + $3;
    });
}