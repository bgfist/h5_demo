/** 宽高尺寸类型 */
export enum SizeSpec {
    /** 未知 */
    Unknown = '',
    /** 固定 */
    Fixed = 'Fixed',
    /** 由子节点撑开 */
    Auto = 'Auto',
    /** 由父节点分配，如flex1 */
    Constrained = 'Constrained',
};

/** flex方向 */
export enum Direction {
    /** 未知 */
    Unknown = '',
    /** 横向的flex盒子 */
    Row = 'Row',
    /** 竖向的flex盒子 */
    Column = 'Column',
};

/** 节点用途 */
export type Role = '' | 'page' | 'border' | 'divider' | 'list-x' | 'list-y' | 'list-wrap' | 'list-item' | 'scroller' | 'btn' | 'tab' | 'dialog';

/** 可渲染的虚拟节点 */
export interface VNode {
    id?: string;
    tagName?: string;
    classList: string[];
    attributes?: Record<string, string>;
    children?: VNode[];
    textContent?: string | VNode[];
    textMultiLine?: boolean;
    style?: Record<string, string>;
    role?: Role;

    bounds: {
        left: number;
        right: number;
        top: number;
        bottom: number;
        width: number;
        height: number;
    };
    widthSpec?: SizeSpec;
    heightSpec?: SizeSpec;
    direction?: Direction;

    /** 层级 */
    index: number;

    /** 此节点相交的节点，面积比它更小。可以做绝对定位，也可以做负的margin */
    attachNodes?: VNode[];
}

/** 节点遍历上下文 */
export const context = {
    index: 0,
} as {
    index: number;
    root: VNode;
};

/** 仅便于调试 */
export function newVNode(vnode: VNode) {
    return vnode;
}

export function getClassName(vnode: VNode) {
    return vnode.classList.filter(Boolean).join(' ');
}

export function getClassList(vnode: VNode) {
    return getClassName(vnode).split(' ').filter(Boolean);
}