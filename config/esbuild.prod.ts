import esbuild from 'esbuild';
import process from 'node:process';

import common, { iframeConfig } from './esbuild.common';

(async () => {
	const ctx = await esbuild.context(common);
	const iframeCtx = await esbuild.context(iframeConfig);

	if (process.argv.includes('--watch')) {
		await ctx.watch();
		await iframeCtx.watch();
	} else {
		await ctx.rebuild();
		await iframeCtx.rebuild();
		// 释放资源，避免文件句柄泄漏
		await ctx.dispose();
		await iframeCtx.dispose();
		process.exit(0);
	}
})();
