/**
 * Renders edge features (rivers, roads, bridges) between hexes
 *
 * Key: Each edge is shared by two hexes. We only draw from directions 0, 1, 2
 * (East, Northeast, Northwest) to avoid double-drawing.
 */
class EdgeRenderer {
    constructor(ctx, layout) {
        this.ctx = ctx;
        this.layout = layout;
    }

    // Draw all edges for a cell (only directions 0, 1, 2 to avoid duplicates)
    drawEdges(cell, map) {
        for (let dir = 0; dir < 3; dir++) {
            const feature = cell.getEdge(dir);
            if (feature === EdgeFeature.NONE) continue;

            switch (feature) {
                case EdgeFeature.RIVER:
                    this.drawRiver(cell.hex, dir);
                    break;
                case EdgeFeature.ROAD:
                    this.drawRoad(cell.hex, dir, map);
                    break;
                case EdgeFeature.BRIDGE:
                    this.drawRiver(cell.hex, dir);
                    this.drawBridge(cell.hex, dir, map);
                    break;
            }
        }
    }

    // Draw only roads and bridges (rivers drawn separately as continuous path)
    drawRoadsOnly(cell, map) {
        for (let dir = 0; dir < 3; dir++) {
            const feature = cell.getEdge(dir);
            if (feature === EdgeFeature.ROAD) {
                this.drawRoad(cell.hex, dir, map);
            } else if (feature === EdgeFeature.BRIDGE) {
                this.drawBridge(cell.hex, dir, map);
            }
        }
    }

    // Draw river along hex edge
    drawRiver(hex, direction) {
        const props = getEdgeProperties(EdgeFeature.RIVER);
        const [p1, p2] = this.layout.getEdgeCorners(hex, direction);

        // River base (darker blue)
        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.strokeStyle = props.color;
        this.ctx.lineWidth = props.width;
        this.ctx.lineCap = 'round';
        this.ctx.stroke();

        // River highlight (lighter blue center)
        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.strokeStyle = props.highlightColor;
        this.ctx.lineWidth = props.width - 3;
        this.ctx.stroke();
    }

    // Draw road connecting hex centers through edge
    drawRoad(hex, direction, map) {
        const props = getEdgeProperties(EdgeFeature.ROAD);
        const center = this.layout.hexToPixel(hex);
        const edgeMid = this.layout.getEdgeMidpoint(hex, direction);

        // Road base
        this.ctx.beginPath();
        this.ctx.moveTo(center.x, center.y);
        this.ctx.lineTo(edgeMid.x, edgeMid.y);
        this.ctx.strokeStyle = props.color;
        this.ctx.lineWidth = props.width;
        this.ctx.lineCap = 'round';
        this.ctx.stroke();

        // Road border/edge
        this.ctx.beginPath();
        this.ctx.moveTo(center.x, center.y);
        this.ctx.lineTo(edgeMid.x, edgeMid.y);
        this.ctx.strokeStyle = props.borderColor;
        this.ctx.lineWidth = props.width + 2;
        this.ctx.lineCap = 'round';
        this.ctx.globalCompositeOperation = 'destination-over';
        this.ctx.stroke();
        this.ctx.globalCompositeOperation = 'source-over';

        // Draw the other half from neighbor's center
        const neighbor = hex.neighbor(direction);
        if (map && map.hasCell(neighbor)) {
            const neighborCenter = this.layout.hexToPixel(neighbor);

            this.ctx.beginPath();
            this.ctx.moveTo(neighborCenter.x, neighborCenter.y);
            this.ctx.lineTo(edgeMid.x, edgeMid.y);
            this.ctx.strokeStyle = props.color;
            this.ctx.lineWidth = props.width;
            this.ctx.lineCap = 'round';
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.moveTo(neighborCenter.x, neighborCenter.y);
            this.ctx.lineTo(edgeMid.x, edgeMid.y);
            this.ctx.strokeStyle = props.borderColor;
            this.ctx.lineWidth = props.width + 2;
            this.ctx.lineCap = 'round';
            this.ctx.globalCompositeOperation = 'destination-over';
            this.ctx.stroke();
            this.ctx.globalCompositeOperation = 'source-over';
        }
    }

    // Draw bridge over river
    drawBridge(hex, direction, map) {
        const props = getEdgeProperties(EdgeFeature.BRIDGE);
        const [p1, p2] = this.layout.getEdgeCorners(hex, direction);
        const edgeMid = this.layout.getEdgeMidpoint(hex, direction);

        // Calculate bridge orientation
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const bridgeLength = Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.5;

        this.ctx.save();
        this.ctx.translate(edgeMid.x, edgeMid.y);
        this.ctx.rotate(angle);

        // Bridge planks (wooden deck)
        this.ctx.fillStyle = props.color;
        this.ctx.fillRect(-bridgeLength / 2, -props.width / 2, bridgeLength, props.width);

        // Bridge border
        this.ctx.strokeStyle = props.borderColor;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(-bridgeLength / 2, -props.width / 2, bridgeLength, props.width);

        // Plank lines
        this.ctx.strokeStyle = props.borderColor;
        this.ctx.lineWidth = 1;
        const plankCount = 5;
        for (let i = 1; i < plankCount; i++) {
            const x = -bridgeLength / 2 + (bridgeLength / plankCount) * i;
            this.ctx.beginPath();
            this.ctx.moveTo(x, -props.width / 2);
            this.ctx.lineTo(x, props.width / 2);
            this.ctx.stroke();
        }

        this.ctx.restore();

        // Draw road portions connecting to bridge
        this.drawRoad(hex, direction, map);
    }
}
