import type {Vault} from 'obsidian';


export const STATUS_OFFLINE = 'Neo4j stream offline';
export const APP_TYPE = 'neo4j-visualizer'
export const DATA_FOLDER = function(vault: Vault) {
  return `${vault.configDir}/plugins/juggl/`;
};
