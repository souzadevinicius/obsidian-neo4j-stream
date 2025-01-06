import { TFile, Vault, MetadataCache, Setting, Plugin, ItemView, WorkspaceLeaf, debounce, Notice } from 'obsidian';
import * as d3 from "d3";
import type {
	INeo4jStreamSettings,
} from './settings';
import {Neo4jStream} from './stream';
import {DefaultNeo4jStreamSettings, Neo4jStreamSettingsTab} from './settings';
import {STATUS_OFFLINE, APP_TYPE} from './constants';

declare global {
    interface Window {
        NeoStream: any;
    }
}

export default class Neo4jPlugin extends Plugin {
	settings: INeo4jStreamSettings;
	statusBar: HTMLElement;
	neo4jStream: Neo4jStream;
	vault: Vault;
	metadata: MetadataCache
	
	async onload(): Promise<void> {
		super.onload();
		console.log('Loading Neo4j stream');
		this.settings = Object.assign({}, DefaultNeo4jStreamSettings, await this.loadData());
		
		this.vault = this.app.vault;
		this.metadata = this.app.metadataCache;
		
		this.statusBar = this.addStatusBarItem();
		this.statusBar.setText(STATUS_OFFLINE);
		this.neo4jStream = new Neo4jStream(this);
		this.addChild(this.neo4jStream);
		
		this.addCommand({
			id: 'restart-stream',
			name: 'Restart Neo4j stream',
			callback: () => {
				console.log('Restarting stream');
				this.neo4jStream.stop();
				this.neo4jStream.start();
			},
		});
		this.addCommand({
			id: 'stop-stream',
			name: 'Stop Neo4j stream',
			callback: () => {
				this.neo4jStream.stop();
			},
		});
		
		// Register the new view
		this.registerView(APP_TYPE, (leaf: WorkspaceLeaf) => new ScGraphItemView(leaf, this));
		
		// Register hover link source
		this.registerHoverLinkSource(APP_TYPE, {
			display: 'Smart connections visualizer hover link source',
			defaultMod: true
		});
		
		
		this.addRibbonIcon('git-fork', 'Open neo4j-visualizer', (evt: MouseEvent) => {
			// Check if the view is already open
			const existingLeaf = this.app.workspace.getLeavesOfType(APP_TYPE)[0];
			if (existingLeaf) {
				// If it exists, focus on it
				this.app.workspace.setActiveLeaf(existingLeaf);
			} else {
				// Create a new leaf in the current workspace
				let leaf = this.app.workspace.getLeaf(true);
				// Set the new leaf's view to your custom view
				leaf.setViewState({
					type: APP_TYPE,
					active: true,
				});
			}
		})
		
		
		// this.addCommand({
		//   id: 'open-bloom-link',
		//   name: 'Open note in Neo4j Bloom',
		//   callback: () => {
		//       if (!this.stream_process) {
		//           new Notice("Cannot open in Neo4j Bloom as neo4j stream is not active.")
		//       }
		//       let active_view = this.app.workspace.getActiveViewOfType(MarkdownView);
		//       if (active_view == null) {
		//           return;
		//       }
		//       let name = active_view.getDisplayText();
		//       // active_view.getState().
		//
		//       console.log(encodeURI("neo4j://graphapps/neo4j-bloom?search=SMD_no_tags with name " + name));
		//       open(encodeURI("neo4j://graphapps/neo4j-bloom?search=SMD_no_tags with name " + name));
		//       // require("electron").shell.openExternal("www.google.com");
		//   },
		// });
		
		
		this.addSettingTab(new Neo4jStreamSettingsTab(this.app, this));
		this.app.workspace.onLayoutReady(() => {
			this.neo4jStream.start();
		});
		
	}
	
	// nodeCypher(label: string): string {
	//   return 'MATCH (n) WHERE n.name="' + label +
	//         '" AND n.' + PROP_VAULT + '="' + this.app.vault.getName() +
	//         '" RETURN n';
	// }
	//
	// localNeighborhoodCypher(label:string): string {
	//   return 'MATCH (n {name: "' + label +
	//         '", ' + PROP_VAULT + ':"' + this.app.vault.getName() +
	//         '"}) OPTIONAL MATCH (n)-[r]-(m) RETURN n,r,m';
	// }
	
	// executeQuery() {
	//   // Code taken from https://github.com/mrjackphil/obsidian-text-expand/blob/0.6.4/main.ts
	//   const currentView = this.app.workspace.activeLeaf.view;
	//
	//   if (!(currentView instanceof MarkdownView)) {
	//     return;
	//   }
	//
	//   const cmDoc = currentView.sourceMode.cmEditor;
	//   const curNum = cmDoc.getCursor().line;
	//   const query = this.getContentBetweenLines(curNum, '```cypher', '```', cmDoc);
	//   if (query.length > 0) {
	//     const leaf = this.app.workspace.splitActiveLeaf(this.settings.splitDirection);
	//     try {
	//       // TODO: Pass query.
	//       // const neovisView = new NeoVisView((leaf, this, name, [new ObsidianStore(this)]);
	//       // leaf.open(neovisView);
	//     } catch (e) {
	//       if (e instanceof Neo4jError) {
	//         new Notice('Invalid cypher query. Check console for more info.');
	//       } else {
	//         throw e;
	//       }
	//     }
	//   }
	// }
	async onunload() {
		super.onunload();
		console.log('Unloading Neo4j stream');
	}
}



class ScGraphItemView extends ItemView {
	
	private plugin: Neo4jPlugin;
	
	searchInput: HTMLTextAreaElement;
	tooltip: HTMLElement;
	currentNoteKey: string;
	noteConnections: any; 
	centralNote: any;
	centralNode: any;
	connectionType = 'block';
	isHovering: boolean; 
	searchText: string;
	relevanceScoreThreshold = 0.5;
	nodeSize = 7;
	linkThickness = 0.3;
	repelForce = 400;
	linkForce = 0.4;
	linkDistance = 70;
	centerForce = 0.3;
	textFadeThreshold = 1.1;
	minScore = 1;
	maxScore = 0;
	minNodeSize = 3;
	maxNodeSize = 6;
	minLinkThickness = 0.3;
	maxLinkThickness = 0.6;
	nodeSelection: any;
	linkSelection: any;
	linkLabelSelection: any;
	labelSelection: any;
	updatingVisualization: boolean;
	isCtrlPressed = false;
	isAltPressed = false;
	isDragging = false;
	isChangingConnectionType = true;
	selectionBox: any;
	validatedLinks: any;
	maxLabelCharacters = 18;
	linkLabelSize = 7;
	nodeLabelSize = 10;
	blockFillColor = '#926ec9';
	noteFillColor = '#7c8594';
	wikiFillColor = '#145da0';
	language = 'en';
	startX = 0;
	startY = 0;
	nodes : any = [];
	links : any = [];
	connections : any = [];
	svgGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
	svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
	centerHighlighted = false;
	simulation: any;
	dragging = false;
	highlightedNodeId = '-1';
	currentNoteChanging = false;
	isFiltering = false;	
	settingsMade = false;
	
	constructor(leaf: WorkspaceLeaf, plugin: Neo4jPlugin) {
		super(leaf);
		this.currentNoteKey = '';
		this.isHovering = false;
		this.plugin = plugin;
		this.searchText = '';
		// Set the initial values from the loaded settings
	}
	
	getViewType(): string {
		return APP_TYPE;
	}
	
	getDisplayText(): string {
		return APP_TYPE;
	}
	
	getIcon(): string {
		return "git-fork";
	}
	
	
	createSearchInput() {
		this.searchInput = this.contentEl.createEl('textarea');
		this.searchInput.rows = 10; // Set the number of visible rows
		this.searchInput.placeholder = 'Type something...';
		this.contentEl.appendChild(this.searchInput);
		
		const submitButton = this.contentEl.createEl('button');
		submitButton.textContent = 'Submit';
		this.contentEl.appendChild(submitButton);
		
		submitButton.addEventListener('click', async() => {
			await this.handleSubmit(this.searchInput.value);
		});
		this.searchInput.addEventListener('keydown', async(event) => {
			if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
				event.preventDefault(); // Prevent default form submission behavior
				await this.handleSubmit(this.searchInput.value);
			}
		});
	}
	
	async handleSubmit(value: string) {
		await this.updateVisualization(this.searchInput.value);
		console.log('Submitted value:', this.searchInput.value);
	}
	
	
	async onOpen() {
		this.contentEl.createEl('h2', { text: 'Smart Visualizer' });
		this.contentEl.createEl('p', { text: 'Waiting for Smart Connections to load...' });
		
		// Introduce a small delay before rendering to give view time to load
		setTimeout(async() => {
			await this.render();
		}, 10000); // Adjust the delay as needed
	}
	
	async render(pathName?:string) {
		this.contentEl.empty();
		this.createSearchInput();
		this.setupSVG();
		this.addEventListeners();		
		this.watchForNoteChanges();
		// Load latest active file if opening view for first time
		const currentNodeChange = this.app.workspace.getActiveFile();
		if (currentNodeChange && !this.currentNoteChanging) {
			this.currentNoteKey = currentNodeChange.path;
			this.currentNoteChanging = true;
			this.render(pathName);
			return
		}
		const p = pathName || currentNodeChange.path;
		const query = `OPTIONAL MATCH(n)-[r]-(m)
WHERE n.path = '${p}' 
RETURN *`;
		await this.updateVisualization(query);
	}
	
	updateNodeAppearance() {
		this.nodeSelection.transition().duration(500)
		.attr('fill', (d: any) => d.fill)
		.attr('stroke', (d: any) => d.stroke)
		.attr('stroke-width', (d: any) => d.selected ? 3 : 2)
		.attr('opacity', (d: any) => this.getNodeOpacity(d));
	}
	
	
	setupSVG() {
		const width = this.contentEl.clientWidth;
		const height = this.contentEl.clientHeight;
		
		const svg = d3.select(this.contentEl)
		.append('svg')
		.attr('width', '100%')
		.attr('height', '98%')
		.attr('viewBox', `${width/4} ${height/4} ${width/2} ${height/2}`)
		.attr('preserveAspectRatio', 'xMidYMid meet')
		.call(d3.zoom()
		.scaleExtent([0.1, 10])
		.on('zoom', (event) => {
			svgGroup.attr('transform', event.transform);
			this.updateLabelOpacity(event.transform.k);
		}));
		
		const svgGroup = svg.append('g');
		
		svgGroup.append('g').attr('class', 'smart-connections-visualizer-links');
		svgGroup.append('g').attr('class', 'smart-connections-visualizer-node-labels');
		svgGroup.append('g').attr('class', 'smart-connections-visualizer-link-labels');
		svgGroup.append('g').attr('class', 'smart-connections-visualizer-nodes');
		
		svgGroup.append("defs").append("marker")
		.attr("id", "arrow")
		.attr("viewBox", "0 -5 10 10")
		.attr("refX", 30) // Adjust this value as needed
		.attr("refY", 0)
		.attr("markerWidth", 12)
		.attr("markerHeight", 12)
		.attr("orient", "auto")
		.append("path")
		.attr("d", "M0,-5L10,0L0,5")
		.attr("fill", "#000000"); // Color of the arrow
		
		this.svgGroup = svgGroup;
		this.svg = svg;
	}
	
	addEventListeners() {
		this.setupSVGEventListeners();
		this.setupKeyboardEventListeners();
	}
	
	setupSVGEventListeners() {
		d3.select('svg')
		.on('mousedown', this.onMouseDown.bind(this))
		.on('mousemove', this.onMouseMove.bind(this))
		.on('mouseup', this.onMouseUp.bind(this))
		.on('click', this.onSVGClick.bind(this));
	}
	
	onMouseDown(event: any) {
	}
	
	onMouseMove(event: any) {
	}
	
	onMouseUp() {
	}
	
	onSVGClick(event: any) {
		if (!event.defaultPrevented && !event.ctrlKey) this.clearSelections();
	}
	
	setupKeyboardEventListeners() {
		document.addEventListener('keydown', this.onKeyDown.bind(this));
		document.addEventListener('keyup', this.onKeyUp.bind(this));
	}
	
	onKeyDown(event: any) {
	}
	
	onKeyUp(event: any) {
	}
	
	clearSelections() {
		this.nodeSelection.each((d: any) => {
			d.selected = false;
			d.highlighted = false;
		});
		this.updateNodeAppearance();
	}
	
	watchForNoteChanges() {
		this.app.workspace.on('file-open', (file) => {
			if (file && (this.currentNoteKey !== file.path) && !this.isHovering && this.containerEl.children[1].checkVisibility()) {
				this.currentNoteKey = file.path;
				this.currentNoteChanging = true;
				this.render();
			}
		});
		let lastLeaf: string;
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', async(leaf) => {
				const existingLeaf = this.app.workspace.getLeavesOfType(APP_TYPE)[0];
				if(existingLeaf){
					const l = existingLeaf.view as ScGraphItemView;
					const leafName = leaf?.view?.file?.path || leaf?.view?.title;
					if (leafName && this.currentNoteKey != leafName && !this.isHovering && this.containerEl.children[1].checkVisibility()) {
						// return this.updateVisualization('', leafName);
					}
				}
			}) 	
		);
	}
	
	
	updateLabelOpacity(zoomLevel: number) {
		const maxOpacity = 1;
		const minOpacity = 0;
		const minZoom = 0.1;
		const maxZoom = this.textFadeThreshold; // Use the threshold value from the slider
		
		let newOpacity = (zoomLevel - minZoom) / (maxZoom - minZoom);
		if (zoomLevel <= minZoom) newOpacity = minOpacity;
		if (zoomLevel >= maxZoom) newOpacity = maxOpacity;
		
		newOpacity = Math.max(minOpacity, Math.min(maxOpacity, newOpacity));
		
		// Update node labels opacity based on zoom level
		if(this.labelSelection) {
			this.labelSelection.transition().duration(300).attr('opacity', (d: any) => this.getNodeOpacity(d));
		}
	}	
	
	getNodeOpacity(d: any) {
		// if (this?.searchText.trim() != '') return d.id.toLowerCase().indexOf(this.searchText) > -1 ? 1 : .1;
		if (d.selected) return 1;
		if (d.highlighted) return 0.8;
		return this.isHovering ? 0.1 : 1;
	}
	
	normalizeScore(score: number) : number{
		// When only one link, can't retun 0
		if (this.minScore === this.maxScore) {
			return 0.5; // or any other value in the range [0, 1]
		}
		return (score - this.minScore) / (this.maxScore - this.minScore);
	}
	
	
	linkDistanceScale(score: number) {
		return d3.scaleLinear()
		.domain([0, 1])
		.range([this.linkDistance / 300, this.linkDistance / 100])(this.normalizeScore(score));
	}
	
	
	
	simulationTickHandler() {
		this.nodeSelection.attr('cx', (d: any) => {
			return d.x || 10
		}).attr('cy', (d: any) => d.y|| 20).style('cursor', 'pointer');
		this.linkSelection.attr('x1', (d: any) => d.source.x || 0).attr('y1', (d: any) => d.source.y || 0).style('cursor', 'pointer')
		.attr('x2', (d: any) => d.target.x || 0).attr('y2', (d: any) => d.target.y || 0);
		this.linkLabelSelection.attr('x', (d: any) => ((d.source.x + d.target.x) / 2))
		.attr('y', (d: any) => (((d.source.y + d.target.y)|| Math.random() * 100) / 2));
		this.labelSelection
		.attr('x', (d: any) => d.x|| Math.random() * 100)
		.attr('y', (d: any) => d.y|| Math.random() * 100);
		
	}
	avoidLabelCollisions() {
		const padding = 5; // Adjust padding as needed
		return (alpha: number) => {
			const quadtree = d3.quadtree()
			.x((d: any) => d.x)
			.y((d: any) => d.y)
			.addAll(this.labelSelection.data());
			
			this.labelSelection.each((d: any) => {
				const radius = d.radius + padding; // Assuming each label has a radius, adjust as necessary
				const nx1 = d.x - radius, nx2 = d.x + radius, ny1 = d.y - radius, ny2 = d.y + radius;
				
				quadtree.visit((quad, x1, y1, x2, y2) => {
					if ('data' in quad && quad.data && (quad.data !== d)) {						
						let x = d.x - (quad.data as any).x,
						y = d.y - (quad.data as any).y,
						l = Math.sqrt(x * x + y * y),
						r = radius + (quad.data as any).radius;
						if (l < r) {
							l = (l - r) / l * alpha;
							d.x -= x *= l;
							d.y -= y *= l;
							(quad.data as any).x += x;
							(quad.data as any).y += y;
						}
					}
					return x1 > nx2 || x2 < nx1 || y1 > ny2 || y2 < ny1;
				});
			});
		};
	}
	
	
	initializeSimulation(width: number, height: number) {
		this.simulation = d3.forceSimulation()
		.force('center', d3.forceCenter(width / 2, height / 2).strength(this.centerForce))
		.force('charge', d3.forceManyBody().strength(-this.repelForce))
		// .force('link', d3.forceLink().id((d: any) => d.id).distance(this.linkDistance).strength(this.linkForce))
		.force('link', d3.forceLink()
		.id((d: any) => d.id)
		.distance((d: any) => this.linkDistanceScale(1))
		.strength(this.linkForce))
		.force('collide', d3.forceCollide().radius(this.nodeSize + 3).strength(0.7))
		.on('tick', this.simulationTickHandler.bind(this));
		
		// Add the custom force for labels
		this.simulation.force('labels', this.avoidLabelCollisions.bind(this));
		
		
	}
	
	getSVGDimensions() {
		const width = this.contentEl.clientWidth || this.contentEl.getBoundingClientRect().width;
		const height = this.contentEl.clientHeight || this.contentEl.getBoundingClientRect().height;
		return { width, height };
	}
	
	
	async updateConnections(query: string) {
		this.searchInput.value = query;
		this.svgGroup.selectAll('.smart-connections-visualizer-text').remove();
		this.nodes = [];
		this.links = [];
		this.connections = [];
		try {
			const result = await this.plugin.neo4jStream.session().run(query);
			const parsedResult = this.plugin.neo4jStream.parseNeo4jResult(result.records);
			const relationships = parsedResult?.relationships;
			const nodes = parsedResult?.nodes;
			this.addFilteredConnections(nodes, relationships);
		} catch (error) {
			console.error(error);
		}
		
		
		// Call the functions after all asynchronous operations are complete
		const isValid = this.validateGraphData(this.nodes, this.links);
		if (!isValid) console.error('Graph data validation failed.');
	}
	
	addFilteredConnections(noteConnections: any, rels: any) {
		const filteredConnections = noteConnections;
		filteredConnections.forEach((connection: any, index: any) => {
			if (connection) {
				const connectionId = connection?.id;
				this.addConnectionNode(connectionId, connection);
			} else {
				console.warn(`Skipping invalid connection at index ${index}:`, connection);
			}
		});
		rels.forEach((rel: any) => {
			this.addConnectionLink(rel);
		})
		console.log('Nodes after addFilteredConnections:', this.nodes);
		console.log('Links after addFilteredConnections:', this.links);	
	}
	
	addConnectionNode(connectionId: any, connection: any) {
		this.nodes.push({
			id: connectionId,
			name: connection?.label,
			group: 'note',
			x: Math.random() * 1000,
			path: connection.path,
			uri: connection.uri,
			y: Math.random() * 1000,
			fx: null,
			fy: null,
			fill: connection.parent ? this.blockFillColor : this.noteFillColor,
			selected: false,
			highlighted: false,
		});
	}
	
	addConnectionLink(rel: any) {
		const sourceNode = this.nodes.find((node: { id: string; }) => node.id === rel?.source?.id);
		const targetNode = this.nodes.find((node: { id: string; }) => (node.id === rel?.target?.id));
		
		if (!sourceNode) {
			console.error(`Source node not found: ${sourceNode?.id}`);
			return;
		}
		
		if (!targetNode) {
			console.error(`Target node not found: ${targetNode?.id}`);
			return;
		}
		
		this.links.push({
			source: sourceNode?.id,
			target: targetNode?.id,
			value: 1
		});
		this.connections.push({
			source: sourceNode?.id,
			target: targetNode?.id,
			score: 1
		});
	}
	
	
	validateGraphData(nodes: any[], links: any[]): boolean {
		const nodeIds = new Set(nodes.map(node => node.id));
		let isValid = true;
		links.forEach((link, index) => {
			if (!nodeIds.has(link.source)) {
				console.error(`Link at index ${index} has an invalid source: ${link.source}`);
				isValid = false;
			}
			if (!nodeIds.has(link.target)) {
				console.error(`Link at index ${index} has an invalid target: ${link.target}`);
				isValid = false;
			}
		});
		nodes.forEach((node, index) => {
			if (!node.hasOwnProperty('id') || !node.hasOwnProperty('name') || !node.hasOwnProperty('group')) {
				console.error(`Node at index ${index} is missing required properties: ${JSON.stringify(node)}`);
				isValid = false;
			}
		});
		return isValid;
	}
	
	
	
	async updateVisualization(query: string, pathName?:string) {
		if (!query || query.trim() === ''){
			return;
		}
		console.log('chamou', query, pathName)
		this.searchText = query;
		try {
			
			// Only update if we're not already updating
			if (this.updatingVisualization && !this.isChangingConnectionType) {
				this.updatingVisualization = false;
				this.currentNoteChanging = false;
				return;
			}
			
			this.isChangingConnectionType = false;
			await this.updateConnections(query)
			
			const visibleNodes = new Set<string>();
			
			const filteredConnections = this.connections;
			filteredConnections.forEach((connection: any) => {
				visibleNodes.add(connection.source);
				visibleNodes.add(connection.target);
			});
			
			
			const nodesData = Array.from(visibleNodes).map((id: any) => {
				const node = this.nodes.find((node: any) => node.id === id);
				return node ? node : null;
			}).filter(Boolean);
			
			// Check and initialize node positions
			nodesData.forEach((node: any) => {
				
				if (!node.x || !node.y) {
					// console.warn(`Node with invalid position: ${node.id}`);
					node.x = Math.random() * 1000; // or some default value
					node.y = Math.random() * 1000; // or some default value
				}
			});
			
			this.validatedLinks = filteredConnections.filter((link: any) => {
				const sourceNode = nodesData.find((node: any) => node.id === link.source);
				const targetNode = nodesData.find((node: any) => node.id === link.target);
				if (!sourceNode || !targetNode) {
					console.log(sourceNode, targetNode, nodesData, link.source, link.targetx)
					console.warn(`Link source or target node not found: ${link.source}, ${link.target}`);
				}
				return sourceNode && targetNode;
			});
			
			if (nodesData.length === 0 || this.validatedLinks.length === 0) {
				this.updatingVisualization = false;
				console.warn('No nodes or links to display after filtering. Aborting update.');
				new Notice('No nodes or links to display after filtering. Adjust filter settings');
				
				// Clear the existing nodes and links from the visualization
				this.nodeSelection = this.svgGroup.select('g.smart-connections-visualizer-nodes').selectAll('circle').data([]).exit().remove();
				this.linkSelection = this.svgGroup.select('g.smart-connections-visualizer-links').selectAll('line').data([]).exit().remove();
				this.linkLabelSelection = this.svgGroup.select('g.smart-connections-visualizer-link-labels').selectAll('text').data([]).exit().remove();
				this.labelSelection = this.svgGroup.select('g.smart-connections-visualizer-node-labels').selectAll('text').data([]).exit().remove();
				return;
			}
			
			this.updateNodeAndLinkSelection(nodesData);
			
			
			if (!this.simulation || this.currentNoteChanging || this.isFiltering) {
				const { width, height } = this.getSVGDimensions();
				this.initializeSimulation(width, height);
				this.currentNoteChanging = false;
				this.isFiltering = false;
			}
			
			this.simulation.nodes(nodesData).on('tick', this.simulationTickHandler.bind(this));
			this.simulation.force('link').links(this.validatedLinks)
			.distance((d: any) => this.linkDistanceScale(d.score)); // Ensure the link distance is applied
			
			this.simulation.alpha(1).restart();
			
			// Stop the simulation after a short delay
			setTimeout(() => {
				this.simulation.alphaTarget(0);
			}, 1000); // Adjust the delay as needed
			
			this.updatingVisualization = false;
			
			
		} catch (error) {
			// console.error("Error running query:", error);
		}
	}
	
	getLinkStrokeWidth(d: any) {
		return d3.scaleLinear()
		.domain([this.minScore, this.maxScore])
		.range([this.minLinkThickness, this.maxLinkThickness])(d.score);
	}
	
	
	enterLink(enter: any) {
		return enter.append('line')
		.attr('class', 'smart-connections-visualizer-link')
		.attr('stroke', (d: any) => d.stroke)
		.attr('stroke-width', (d: any) => this.getLinkStrokeWidth(d))
		.attr('stroke-opacity', 1)
		.attr("marker-end", "url(#arrow)")   
		.attr('opacity', 1);
	}
	
	
	updateLink(update: any) {
		return update.attr('stroke', '#4c7787')
		.attr('stroke-width', (d: any) => this.getLinkStrokeWidth(d));
	}
	
	enterLinkLabel(enter: any) {
		return enter.append('text')
		.attr('class', 'smart-connections-visualizer-link-label')
		.attr('font-size', this.linkLabelSize)
		.attr('fill', '#bbb')
		.attr('opacity', 0)
		.attr('x', (d: any) => 10) // Initialize x position
		.attr('y', (d: any) => 20) // Initialize y position
		.text((d: any) => (JSON.stringify(d)));
	}
	
	updateLinkLabel(update: any) {
		
		return update.text((d: any) => (d.score * 100).toFixed(1))
		.attr('x', (d: any) => d.x) // Initialize x position
		.attr('y', (d: any) => d.y) // Initialize y position
	}
	
	onDragStart(event: any, d: any) {
		if (!event.active) this.simulation.alphaTarget(0.3).restart();
		this.dragging = true;
		d.fx = d.x;
		d.fy = d.y;
	}
	
	onDrag(event: any, d: any) {
		
		if(this.isHovering) this.isHovering = false;
		
		d.fx = event.x;
		d.fy = event.y;
	}
	
	
	
	onDragEnd(event: any, d: any) {
		if (!event.active) this.simulation.alphaTarget(0);
		d.fx = null;
		d.fy = null;
		this.dragging = false
		// this.renderCommunityText();
	}
	
	
	formatLabel(path: string, truncate: boolean = true) {
		let label = this.extractLabel(path);
		return truncate ? this.truncateLabel(label) : label;
	}
	
	extractLabel(path: string) {
		let label = path;
		label = label.replace(/[\[\]]/g, '') // Remove brackets if they exist
		.replace(/\.[^/#]+#(?=\{\d+\}$)/, '') // Remove hashtag if it exists
		.replace(/\.[^/.]+$/, ''); // Remove file extension if it exists
		return label;
	}
	
	truncateLabel(label: string) {
		return label.length > this.maxLabelCharacters ? label.slice(0, this.maxLabelCharacters) + '...' : label;
	}
	
	get env() { return window.NeoStream?.main?.env; }
	
	enterLabel(enter: any) {
		return enter.append('text')
		.attr('class', 'smart-connections-visualizer-label')
		.attr('dx', 0)
		.attr('font-size', (d: any) => this.nodeSize)
		// .attr('font-size', this.nodeLabelSize)
		.attr('dy', -10)
		.attr('text-anchor', 'middle')
		.attr('fill', '#bbb')
		.attr('data-id', (d: any) => d.id)
		.attr('opacity', 1)
		.attr('x', (d: any) => d.x) // Initialize x position
		.attr('y', (d: any) => d.y) // Initialize y position
		.text((d: any) => this.formatLabel(d.name));
	}
	
	updateLinkAppearance(node: any) {
		this.linkSelection.transition().duration(500)
		.attr('opacity', (d: any) => (d.source.id === node.id || d.target.id === node.id) ? 1 : 0.1);
	}
	
	updateLabelAppearance(node: any) {
		this.labelSelection.transition().duration(500)
		.attr('opacity', (d: any) => this.getNodeOpacity(d))
		// .attr('opacity', (d: any) => this.getLabelOpacity(d, node))
		.text((d: any) =>  d.id === this.highlightedNodeId ? this.formatLabel(d.name, false) : this.formatLabel(d.name, true));
	}
	
	updateLinkLabelAppearance(node: any) {
		this.linkLabelSelection.transition().duration(500)
		.attr('opacity', (d: any) => {
			return 0
			// return (d.source.id === node.id || d.target.id === node.id) ? 1 : 0;
		})
	}
	
	
	
	highlightNode(node: any) {
		
		
		this.highlightedNodeId = node.id;
		
		this.nodeSelection.each((d: any) => {
			d.highlighted = (d.id === node.id || this.validatedLinks.some((link: any) =>
				(link.source.id === node.id && link.target.id === d.id) ||
			(link.target.id === node.id && link.source.id === d.id)));
		});
		this.updateNodeAppearance();
		this.updateLinkAppearance(node);
		this.updateLabelAppearance(node);
		this.updateLinkLabelAppearance(node);
	}
	
	resetLinkAppearance() {
		this.linkSelection.transition().duration(500).attr('opacity', (d: any) => this.getNodeOpacity(d));
	}
	
	resetLabelAppearance() {
		this.labelSelection.transition().duration(500).attr('opacity', (d: any) => this.getNodeOpacity(d))
		.text((d: any) => this.formatLabel(d.name, true));
	}
	
	resetLinkLabelAppearance() {
		this.linkLabelSelection.transition().duration(500).attr('opacity', 0);
	}
	
	
	unhighlightNode(node : any) {
		
		// Reset highlighted nodeid
		this.highlightedNodeId = '-1';
		
		this.nodeSelection.each((d: any) =>  d.highlighted = false);
		
		this.updateNodeAppearance();
		this.resetLinkAppearance();
		this.resetLabelAppearance();
		this.resetLinkLabelAppearance();
		this.updateLabelAppearance(null); // Pass false to reset label position
	}
	
	
	
	updateLabel(update: any) {
		return update.attr('dx', 0)
		.attr('data-id', (d: any) => d.id)
		.attr('text-anchor', 'middle')
		.text((d: any) => d.id === this.highlightedNodeId ? this.formatLabel(d.name, false) : this.formatLabel(d.name, true))
		.attr('fill', '#bbb')
		.attr('font-size', this.nodeLabelSize)
		.attr('x', (d: any) => d.x) // Update x position
		.attr('y', (d: any) => d.y) // Update y position with offset for highlight
		.attr('opacity', 1);
	}
	
	async onNodeClick(event: any, d: any) {
		
		
		// if (d?.type === 'wiki')
		// 	await this.openSearch(d);
		// else
	    // Ensure the note path is properly encoded for URI
		window.open(d.uri)
		event.stopPropagation();
		await this.render(d.path);
		// const query = `OPTIONAL MATCH(n)-[r]-(m) WHERE n.path = "${d.path}" RETURN *`
		// await this.updateVisualization(query);
	}	
	
	onNodeMouseOver(event: any, d: any) {
		// Dont trigger possible highlights if user dragging around nodes quickly for fun
		if(this.dragging) return;
		// Don't apply hover affect to center node
		// Hovering state active
		this.isHovering = true;
		const renderImage = (d: any) => {
			return `
				${d?.thumbnail ? `<img src="${d.thumbnail.source}" width="${d.thumbnail.width}" height="${d.thumbnail.height}"/>` : ''}
			`;
		};
		if (d.text && this.isHovering){
			setTimeout(() => {
				this.tooltip.style.display = 'block';
				// this.tooltip.style.left = `${event.pageX + 10}px`;
				// this.tooltip.style.top = `${event.pageY + 10}px`;
				this.tooltip.innerHTML = `<h3>${d.name}</h3><br/>${renderImage(d)}<div>${d.text}</div>`;
			}, 1000);
		}
		
		// Highlight node
		this.highlightNode(d);
		
		// Show link labels associated with the node
		this.updateLinkLabelAppearance(d);
		
		// TODO:: Comment back when ready to implement Label Movement animation on hover
		// console.log(`Hovering over node: ${d.id}, original y: ${d.y}`);
		// this.svgGroup.select(`text[data-id='${d.id}']`).transition().duration(4000).attr('y', d.y + 8); // Animate label down 10 pixels
		
		this.app.workspace.trigger("hover-link", {
			event,
			source: 'D3',
			hoverParent: event.currentTarget.parentElement,
			targetEl: event.currentTarget,
			linktext: d.id,
		});
	}
	
	onNodeMouseOut(event: any, d: any) {
		if (this.dragging) return;
		
		this.isHovering = false;
		this.centerHighlighted = false;
		this.unhighlightNode(d);
		
		this.updateLinkLabelAppearance({ id: null });
	}
	
	
	
	enterNode(enter: any) {
		const that = this;  // Reference to 'this' context for inner functions
		return enter.append('circle')
		.attr('class', 'smart-connections-visualizer-node')
		.attr('r', (d: any) =>  this.nodeSize)
		.attr('fill', (d: any) => d.fill)
		.attr('stroke', (d: any) => d.stroke)
		.attr('stroke-width', (d: any) => d.selected ? 3 : 2)
		.attr('opacity', 1)
		.attr('cursor', 'pointer')
		.call(d3.drag().on('start', this.onDragStart.bind(this))
		.on('drag', this.onDrag.bind(this))
		.on('end', this.onDragEnd.bind(this)))
		.on('click', this.onNodeClick.bind(this))
		.on('mouseover', this.onNodeMouseOver.bind(this))
		.on('mouseout', this.onNodeMouseOut.bind(this));
	}
	
	updateNode(update: any) {
		return update.attr('r', (d: any) => this.nodeSize)
		.attr('fill', (d: any) => d.selected ? '#f3ee5d' : d.fill)
		.attr('stroke', (d: any) => d.stroke)
		.attr('stroke-width', (d: any) => d.selected ? 3 : 2);
	}
	
	
	
	updateNodeAndLinkSelection(nodesData: any) {
		const svgGroup = this.svgGroup;
		
		// Update links first
		this.linkSelection = svgGroup.select('g.smart-connections-visualizer-links').selectAll('line')
		.data(this.validatedLinks, (d: any) => `${d.source}-${d.target}`)
		.join(
			enter => this.enterLink(enter),
			update => this.updateLink(update),
			exit => exit.remove()
		);
		
		
		this.linkLabelSelection = svgGroup.select('g.smart-connections-visualizer-link-labels').selectAll('text')
		.data(this.validatedLinks, (d: any) => `${d.source.id}-${d.target.id}`)
		.join(
			enter => this.enterLinkLabel(enter),
			update => this.updateLinkLabel(update),
			exit => exit.remove()
		);
		
		this.labelSelection = svgGroup.select('g.smart-connections-visualizer-node-labels').selectAll('text')
		.data(nodesData, (d: any) => d.id)
		.join(
			enter => this.enterLabel(enter),
			update => this.updateLabel(update),
			exit => exit.remove()
		)
		.attr('x', (d: any) => d.x)
		.attr('y', (d: any) => d.y);
		
		// Update nodes after links
		this.nodeSelection = svgGroup.select('g.smart-connections-visualizer-nodes').selectAll('circle')
		.data(nodesData, (d: any) => { 
			return d.id;
		})
		.join(
			enter => this.enterNode(enter),
			update => this.updateNode(update),
			exit => exit.remove()
		);
	}
}