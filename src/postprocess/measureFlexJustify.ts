import * as _ from 'lodash';
import { allNumsEqual, assert, numEq, numGt, numLte, pairPrevNext } from '../utils';
import {
    Dimension,
    DimensionSpec,
    Direction,
    R,
    Side,
    SizeSpec,
    VNode,
    getClassList,
    isFlexWrapLike,
    isListContainer,
    newVNode
} from '../vnode';
import { canChildStretchWithParent } from './measureParentSizeSpec';
import { autoMaybeClamp, expandOverflowChild, setSiblingsNoShrink } from './measureOverflow';

/** 生成justify-content */
export function measureFlexJustify(parent: VNode) {
    const justifySpec = parent.direction === Direction.Row ? 'widthSpec' : 'heightSpec';
    const justifyDimension = parent.direction === Direction.Row ? 'width' : 'height';

    decideChildrenJustifySpec(parent, justifySpec, justifyDimension);
    expandOverflowChildrenIfPossible(parent, justifySpec, justifyDimension);

    const { startGap, endGap, gaps, equalMiddleGaps, justifySide, ranges } = getGapsAndSide(parent);

    const hasConstrainedChilds = _.some(
        parent.children,
        child => child[justifySpec] === SizeSpec.Constrained
    );

    if (
        // Constained元素需要设置margin
        !hasConstrainedChilds &&
        // 中间间隔相等
        equalMiddleGaps &&
        // 列表容器只能靠边分配
        !isListContainer(parent) &&
        maybeSpaceJustify(parent, justifySpec, startGap, endGap, gaps)
    ) {
        return;
    }

    // 由内容自动撑开，则必须具有最小尺寸，否则flex1无效
    // TODO: 这种情况下，高度可能不够，到底是撑开间隙，还是撑开某个元素
    const isParentAutoMinSize =
        parent[justifySpec] === SizeSpec.Auto &&
        getClassList(parent).some(className => className.startsWith(`min-${justifySpec.slice(0, 1)}-`));
    const needEqualGaps = equalMiddleGaps && (parent.children.length > 2 || isListContainer(parent));
    const needFlex1 =
        (parent[justifySpec] === SizeSpec.Constrained || isParentAutoMinSize) &&
        // 2个以上元素才需要用flex1做弹性拉伸;
        // 2个元素的话，如果中间间距很大就会走justify-between；间距过小则不应被撑开
        parent.children.length > 2 &&
        !needEqualGaps &&
        // 已经有constained子元素，让它撑开即可
        !hasConstrainedChilds;

    if (needFlex1) {
        maybeInsertFlex1Node(parent, isParentAutoMinSize, justifySide, startGap, endGap, gaps, ranges);
    }

    sideJustify(parent, justifySpec, justifySide, startGap, endGap, gaps, needEqualGaps);
}

/** 重新决定子元素的尺寸 */
function decideChildrenJustifySpec(parent: VNode, justifySpec: DimensionSpec, justifyDimension: Dimension) {
    _.each(parent.children, child => {
        if (child[justifySpec] === SizeSpec.Constrained) {
            if (parent[justifySpec] === SizeSpec.Fixed) {
                child[justifySpec] = SizeSpec.Fixed;
            }
        } else if (child[justifySpec] === SizeSpec.Auto) {
            // 注意列表元素的alignSpec都是Fixed或者都是Constrained，表示他们的尺寸是一样的
            if (!autoMaybeClamp(child, justifySpec)) {
                if (isFlexWrapLike(child)) {
                    assert(justifySpec === 'widthSpec', 'flexWrap和多行文本只有横向才能不被截断');
                    if (parent[justifySpec] === SizeSpec.Constrained) {
                        // 允许auto元素随父节点拉伸
                        child[justifySpec] = SizeSpec.Constrained;
                    } else {
                        console.debug(
                            '多行元素想撑开,父元素又是auto或fixed,还得固定多行元素的宽度,不然没法换行'
                        );
                        // 这里也可以用最小宽度，但是没用；包一层容器也没用
                        child[justifySpec] = SizeSpec.Fixed;
                    }
                } else if (
                    parent[justifySpec] === SizeSpec.Constrained &&
                    canChildStretchWithParent(child, parent, justifyDimension)
                ) {
                    // 允许auto元素随父节点拉伸
                    child[justifySpec] = SizeSpec.Constrained;
                }
            }
        } else if (!child[justifySpec]) {
            assert(!child.children.length, '只有裸盒子才没设置尺寸');
            if (parent[justifySpec] === SizeSpec.Fixed) {
                child[justifySpec] = SizeSpec.Fixed;
            } else if (
                parent[justifySpec] === SizeSpec.Constrained &&
                canChildStretchWithParent(child, parent, justifyDimension)
            ) {
                child[justifySpec] = SizeSpec.Constrained;
            } else {
                child[justifySpec] = SizeSpec.Fixed;
            }
        }
    });
}

/** 如果设置了超出滚动，则可能需要设置auto元素为flex1 */
function expandOverflowChildrenIfPossible(
    parent: VNode,
    justifySpec: DimensionSpec,
    justifyDimension: Dimension
) {
    if (parent[justifySpec] !== SizeSpec.Constrained) {
        return;
    }

    _.each(parent.children, (child, i) => {
        // 只扩充auto子节点
        if (child[justifySpec] !== SizeSpec.Auto) {
            return;
        }

        expandOverflowChild({
            child,
            spec: justifySpec,
            dimension: justifyDimension,
            // 不需要margin
            margin: {
                marginStart: 0,
                marginEnd: 0
            }
        });
    });
    setSiblingsNoShrink(parent);
}

/** 计算间距信息 */
function getGapsAndSide(parent: VNode) {
    const ssf = parent.direction === Direction.Row ? 'left' : 'top';
    const eef = parent.direction === Direction.Row ? 'right' : 'bottom';

    // 根据children在node中的位置计算flex主轴布局
    const ranges = _.zip(
        [...parent.children.map(n => n.bounds[ssf]), parent.bounds[eef]],
        [parent.bounds[ssf], ...parent.children.map(n => n.bounds[eef])]
    ) as [number, number][];
    const gaps = ranges.map(([p, n]) => p - n);
    const startGap = gaps.shift()!;
    const endGap = gaps.pop()!;
    const equalMiddleGaps = allNumsEqual(gaps);
    const justifySide: Side =
        numEq(startGap, endGap) ? 'center'
        : numLte(startGap, endGap) ? 'start'
        : ('end' as const);

    return {
        startGap,
        endGap,
        gaps,
        equalMiddleGaps,
        justifySide,
        ranges
    };
}

/** 尝试靠space布局 */
function maybeSpaceJustify(
    parent: VNode,
    justifySpec: DimensionSpec,
    startGap: number,
    endGap: number,
    gaps: number[]
) {
    const sameGap = gaps[0];

    if (
        !numEq(sameGap, 0) &&
        !numEq(startGap, 0) &&
        numEq(startGap, endGap) &&
        numEq(startGap * 2, sameGap) &&
        parent[justifySpec] !== SizeSpec.Auto
    ) {
        parent.classList.push('justify-around');
        return true;
    } else if (
        !numEq(sameGap, 0) &&
        numGt(sameGap, startGap) &&
        numGt(sameGap, endGap) &&
        parent[justifySpec] !== SizeSpec.Auto
    ) {
        // const justifyDimension = parent.direction === Direction.Row ? 'width' : 'height';
        // if (
        //     parent[justifySpec] === SizeSpec.Constrained &&
        //     !(numGt(sameGap, parent.children[0].bounds[justifyDimension]) && numGt(sameGap, parent.children[1].bounds[justifyDimension]))
        // ) {
        //     // 这种情况太常见了，很多导致问题
        //     return false;
        // }

        const ss = parent.direction === Direction.Row ? 'l' : 't';
        const ee = parent.direction === Direction.Row ? 'r' : 'b';
        parent.classList.push(R`justify-between p${ss}-${startGap} p${ee}-${endGap}`);
        return true;
    }
    return false;
}

/** 尝试插入flex1节点 */
function maybeInsertFlex1Node(
    parent: VNode,
    flex1MinSize: boolean,
    justifySide: 'start' | 'end' | 'center',
    startGap: number,
    endGap: number,
    gaps: number[],
    ranges: [number, number][]
) {
    // 居中布局的话，除非中间有特别大的间距超过两侧的间距，才需要撑开
    if (justifySide === 'center' && numLte(_.max(gaps)!, startGap * 2)) {
        return;
    }

    // 可以通过flex1实现和stretch类似的效果
    let flex1GapIndex: number;
    // TODO: 生成多个flex1

    if (justifySide === 'start' || justifySide === 'center') {
        const gapsWithSide = [...gaps, endGap];
        const maxGap = _.max(gapsWithSide)!;
        // 优先让后面的撑开
        flex1GapIndex = _.lastIndexOf(gapsWithSide, maxGap);
        if (flex1GapIndex === gaps.length || maxGap === 0) {
            // 撑开最后面的边距说明边距过大，不需要撑开
            return;
        }
    } else {
        const gapsWithSide = [startGap, ...gaps];
        const maxGap = _.max(gapsWithSide)!;
        // 优先让前面的撑开
        flex1GapIndex = _.indexOf(gapsWithSide, maxGap);
        if (flex1GapIndex === 0 || maxGap === 0) {
            // 撑开最前面的边距说明边距过大，不需要撑开
            return;
        } else {
            flex1GapIndex--;
        }
    }

    const sf = parent.direction === Direction.Row ? 'top' : 'left';
    const ef = parent.direction === Direction.Row ? 'bottom' : 'right';
    const ssf = parent.direction === Direction.Row ? 'left' : 'top';
    const eef = parent.direction === Direction.Row ? 'right' : 'bottom';
    const spec1 = parent.direction === Direction.Row ? 'width' : 'height';
    const spec2 = parent.direction === Direction.Row ? 'height' : 'width';
    const pos = Math.round(parent.bounds[sf] + parent.bounds[ef] / 2);
    const [eefn, ssfn] = ranges[flex1GapIndex + 1];

    const flex1Vnode = newVNode({
        bounds: {
            [sf]: pos,
            [ef]: pos,
            [ssf]: ssfn,
            [eef]: eefn,
            // 这里是个trick，如果不需要最小高度，则设置为0
            [spec1]: flex1MinSize ? eefn - ssfn : 0,
            [spec2]: 0
        } as any,
        classList: [],
        [`${spec1}Spec`]: SizeSpec.Constrained,
        [`${spec2}Spec`]: SizeSpec.Fixed
    });

    // 将flex1元素的左右gap设为0
    gaps.splice(flex1GapIndex, 1, 0, 0);
    // 插入flex1元素
    parent.children.splice(flex1GapIndex + 1, 0, flex1Vnode);
}

/** 靠边布局 */
function sideJustify(
    parent: VNode,
    justifySpec: DimensionSpec,
    justifySide: Side,
    startGap: number,
    endGap: number,
    gaps: number[],
    needEqualGaps: boolean
) {
    const ss = parent.direction === Direction.Row ? 'l' : 't';
    const ee = parent.direction === Direction.Row ? 'r' : 'b';
    const xy = parent.direction === Direction.Row ? 'x' : 'y';
    const hasConstrainedChilds = _.some(
        parent.children,
        child => child[justifySpec] === SizeSpec.Constrained
    );

    if (hasConstrainedChilds) {
        // 都flex1了，父节点什么都不用设置
    } else if (justifySide === 'center') {
        if (parent[justifySpec] === SizeSpec.Auto) {
            parent.classList.push(R`p${xy}-${startGap}`);
        } else {
            parent.classList.push('justify-center');
        }
    } else if (justifySide === 'start') {
        if (parent[justifySpec] === SizeSpec.Auto) {
            parent.classList.push(R`p${ee}-${endGap}`);
        }
    } else if (justifySide === 'end') {
        parent.classList.push('justify-end');
        if (parent[justifySpec] === SizeSpec.Auto) {
            parent.classList.push(R`p${ss}-${startGap}`);
        }
    }

    if (hasConstrainedChilds) {
        // flex1全部往左margin
        gaps.unshift(startGap);
        _.each(parent.children, (child, i) => {
            child.classList.push(R`m${ss}-${gaps[i]}`);
        });
        parent.children[parent.children.length - 1].classList.push(R`m${ee}-${endGap}`);
    } else if (needEqualGaps) {
        parent.classList.push(R`space-${xy}-${gaps[0]}`);

        if (justifySide === 'start') {
            parent.classList.push(R`p${ss}-${startGap}`);
        } else if (justifySide === 'end') {
            parent.classList.push(R`p${ee}-${endGap}`);
        }
    } else {
        if (justifySide === 'center') {
            _.each(parent.children.slice(1), (child, i) => {
                child.classList.push(R`m${ss}-${gaps[i]}`);
            });
        } else if (justifySide === 'start') {
            gaps.unshift(startGap);
            _.each(parent.children, (child, i) => {
                child.classList.push(R`m${ss}-${gaps[i]}`);
            });
        } else if (justifySide === 'end') {
            gaps.push(endGap);
            _.each(parent.children, (child, i) => {
                child.classList.push(R`m${ee}-${gaps[i]}`);
            });
        }
    }

    // 对所有灵活伸缩的元素设置flex1
    _.each(parent.children, child => {
        if (child[justifySpec] === SizeSpec.Constrained) {
            const justifyDimension = parent.direction === Direction.Row ? 'width' : 'height';
            child.classList.push(R`grow ${justifyDimension.slice(0, 1)}-${child.bounds[justifyDimension]}`);

            // TODO: 同时有多个Constrained，则可以将其中一个减少一两像素，不然很有可能会导致空间不足
        }
    });
}
