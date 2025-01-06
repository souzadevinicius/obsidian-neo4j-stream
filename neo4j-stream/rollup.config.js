import typescript from '@rollup/plugin-typescript';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import copy from 'rollup-plugin-copy';

const FOLDER = '/home/vinicius/Documents/NotesPC/.obsidian/plugins'
// const FOLDER = '/home/vinicius/workspace/vault/.obsidian/plugins'
export default {
  input: 'main.ts',
  output: {
    format: 'cjs',
    file: 'main.js',
    exports: 'default',
    // banner: '/* This file is bundled with rollup. For the source code, see Github */',
  },
  external: ['obsidian'],
  plugins: [
    commonjs({
      include: ['node_modules/**'],
    }),
    typescript({sourceMap: true}),
    nodeResolve({browser: true}),
    copy({
      targets: [
        {src: '../manifest.json', dest: `${FOLDER}/neo4j-stream`},
        {src: 'main.js', dest: `${FOLDER}/neo4j-stream`},
        {src: 'styles.css', dest: `${FOLDER}/neo4j-stream`},
      ],
      hook: 'writeBundle',
    }),
  ],
};
