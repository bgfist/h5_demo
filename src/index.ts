import * as _ from 'lodash';
import { Config, defaultConfig, debug, BuildStage } from './config';
import { VNode2Code } from './generator/html';
import { Page } from './page';
import { postprocess } from './postprocess';
import { preprocess } from './preprocess';
import { assert } from './utils';
import { VNode, isRole } from './vnode';
import { getProcessedImageUrl } from './generator';
import { md5 } from './utils-md5';

export * from './config';
export { Page };

function makeAbsolute(vnode: VNode, parent?: VNode, isAttachNode?: boolean) {
    if (parent) {
        const left = vnode.bounds.left - parent.bounds.left;
        const top = vnode.bounds.top - parent.bounds.top;
        if (isAttachNode) {
            vnode.attributes = {
                is: 'attachNode',
                ...vnode.attributes
            };
        }
        vnode.classList.push(
            `${vnode.tagName === 'span' ? '' : 'absolute'} left-[${left}px] top-[${top}px] w-[${vnode.bounds.width}px] h-[${vnode.bounds.height}px]`
        );
    } else {
        vnode.classList.push(`relative w-[${vnode.bounds.width}px] h-[${vnode.bounds.height}px]`);
    }
    _.each(vnode.children, child => makeAbsolute(child, vnode));
    _.each(vnode.attachNodes, child => makeAbsolute(child, vnode, true));
}

/**
 * 将幕客设计稿json转成html代码
 *
 * @param page 幕客设计稿json
 * @param config 生成配置
 * @returns 可用的html代码，样式用tailwind.css实现
 */
export function iDocJson2Html(page: Page, config?: Config) {
    _.merge(defaultConfig, config);

    const root = page.layers || (page as unknown as Node);
    assert(root.basic.type === 'group' && root.basic.realType === 'Artboard', '页面根节点不对');

    // 先遍历整棵树，进行预处理，删除一些不必要的节点，将节点的前景背景样式都计算出来，对节点进行分类标记
    const vnode = preprocess(_.cloneDeep(root), 0)!;

    if (debug.buildToStage === BuildStage.Pre) {
        if (!debug.keepOriginalTree) {
            const vnodes: VNode[] = [];
            const collectVNodes = (vnode: VNode) => {
                vnode.classList.push(
                    `${
                        isRole(vnode, 'page') ? 'relative'
                        : vnode.tagName === 'span' ? ''
                        : 'absolute'
                    } left-[${vnode.bounds.left}px] top-[${vnode.bounds.top}px] w-[${vnode.bounds.width}px] h-[${vnode.bounds.height}px]`
                );
                vnodes.push(vnode);
                _.each(vnode.children, collectVNodes);
            };
            collectVNodes(vnode);
            vnodes.sort((a, b) => {
                if (a.bounds.top === b.bounds.top) {
                    if (a.bounds.left === b.bounds.left) {
                        return 0;
                    } else {
                        return a.bounds.left - b.bounds.left;
                    }
                } else {
                    return a.bounds.top - b.bounds.top;
                }
            });
            return vnodes.map(n => VNode2Code(n, 0, false)).join('\n');
        } else {
            makeAbsolute(vnode);
            return VNode2Code(vnode, 0, true);
        }
    }

    postprocess(vnode);

    if (debug.buildToStage === BuildStage.Tree) {
        makeAbsolute(vnode);
    }

    return VNode2Code(vnode, 0, true);
}

declare global {
    interface Window {
        cacheImageMap: Set<string>;
    }
}

export async function replaceHtmlImages(params: {
    html: string;
    prefix: string;
    imageResize: 1 | 2 | 4;
    uploadImage2Remote: boolean;
    useTinypngCompress: boolean;
    tinypngApiKey: string;
}) {
    const { prefix, imageResize, uploadImage2Remote, useTinypngCompress, tinypngApiKey } = params;
    let { html } = params;

    const grapImageUrls = html.matchAll(/bg-\[url\((https:\/\/idoc\.mucang\.cn\/.+\/(.+\.png))\)]/g);
    const imageMap: Record<
        string,
        {
            fullPath: string;
            imageName: string;
            cacheKey: string;
        }
    > = {};
    const hashSet = new Set<string>();
    for (const match of grapImageUrls) {
        if (imageMap[match[0]]) {
            console.warn('有重复图片', match[0]);
        } else {
            const fullPath = match[1];
            const cacheKey =
                fullPath + JSON.stringify({ imageResize, uploadImage2Remote, useTinypngCompress });

            const hash = md5(cacheKey);
            let hashLen = 6;
            let imageHash = hash.slice(0, hashLen);

            while (hashSet.has(imageHash)) {
                console.warn('hash冲突');
                hashLen++;
                imageHash = hash.slice(0, hashLen);
            }

            hashSet.add(imageHash);
            imageMap[match[0]] = {
                fullPath: match[1],
                // imageName: match[2]
                imageName: imageHash + '.png',
                cacheKey
            };
        }
    }

    if (_.isEmpty(imageMap)) {
        return {
            code: html,
            noImages: true
        };
    }

    const cacheImageMap = window.cacheImageMap || (window.cacheImageMap = new Set());

    let processedBefore = false;

    for (const originalClassName in imageMap) {
        const { fullPath, imageName, cacheKey } = imageMap[originalClassName];

        if (!cacheImageMap.has(cacheKey)) {
            await getProcessedImageUrl({
                originalUrl: fullPath,
                imageName,
                imageResize,
                uploadImage2Remote,
                tinypngApiKey,
                useTinypngCompress
            });
            cacheImageMap.add(cacheKey);
        } else {
            processedBefore = true;
        }

        html = html.replace(originalClassName, `bg-[url(${prefix}${imageName})]`);
    }

    return {
        code: html,
        noImages: processedBefore ? ('processedBefore' as const) : false
    };
}
