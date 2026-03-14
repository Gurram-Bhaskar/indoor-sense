"""
Topological graph for indoor navigation + A* pathfinding.
Hardcoded nodes represent physical locations anchored to ArUco marker IDs.
Each node stores rich environment data for the AI assistant.
"""

import heapq

# =============================================================================
# TOPOLOGICAL GRAPH — RICH ENVIRONMENT DATA
# Each node contains: name, grid position, and detailed spatial metadata
# that gets injected into the AI assistant's context for better guidance.
# =============================================================================

NODES = {
    0: {
        "name": "Entrance",
        "pos": (0, 0),
        "description": "Main hospital entrance with automatic glass sliding doors",
        "floor": "smooth tile, slightly slippery when wet",
        "landmarks": [
            "automatic glass doors behind you",
            "hand sanitizer dispenser on the right wall",
            "welcome mat underfoot",
            "security guard desk to the far left",
        ],
        "hazards": [
            "automatic doors may open unexpectedly",
            "wet floor possible near entrance during rain",
        ],
        "dimensions": "wide open area, approximately 6 meters across",
    },
    1: {
        "name": "Reception",
        "pos": (2, 0),
        "description": "Main reception and check-in desk with seating area",
        "floor": "smooth tile, level surface",
        "landmarks": [
            "reception counter directly ahead, waist height",
            "row of plastic chairs to the left forming a waiting area",
            "water cooler in the far left corner",
            "information board on the right wall with braille labels",
            "bell on the counter for assistance",
        ],
        "hazards": [
            "chairs may be moved into the walkway",
            "people queueing near the counter",
        ],
        "dimensions": "medium room, approximately 5 by 4 meters",
    },
    2: {
        "name": "Hallway-A",
        "pos": (2, 3),
        "description": "T-shaped hallway intersection with corridor branching left and right",
        "floor": "vinyl flooring with tactile guide strips along the center",
        "landmarks": [
            "tactile guide strip under your feet running along the corridor",
            "fire extinguisher mounted on the left wall",
            "room number signs on the right wall in raised lettering",
            "overhead fluorescent lights",
            "corridor continues straight ahead and branches right",
        ],
        "hazards": [
            "wheeled carts or trolleys may be parked along walls",
            "people walking from both directions at the intersection",
            "door on the right may swing open unexpectedly",
        ],
        "dimensions": "corridor is about 2 meters wide, intersection opens slightly wider",
    },
    3: {
        "name": "Room-101",
        "pos": (4, 3),
        "description": "Consultation Room 101 — your destination",
        "floor": "carpeted, soft underfoot",
        "landmarks": [
            "door with room number 101 in raised digits at hand height on the right",
            "examination bed against the far wall",
            "two chairs facing a desk on the left side",
            "window with blinds on the far wall",
            "hand sanitizer by the door frame",
        ],
        "hazards": [
            "small step up at the doorway threshold",
            "medical equipment may be on the floor near the bed",
        ],
        "dimensions": "small room, approximately 3 by 4 meters",
    },
}

# =============================================================================
# EDGES with detailed turn-by-turn walking instructions
# (from_id, to_id, weight, forward_instruction, reverse_instruction)
# =============================================================================

EDGES = [
    (
        0, 1, 2,
        "Walk straight ahead about 8 meters. The reception counter will be directly in front of you.",
        "Turn around and walk straight about 8 meters toward the glass entrance doors.",
    ),
    (
        1, 2, 3,
        "From the reception, turn left and walk down the corridor for about 12 meters. Follow the tactile strip on the floor. You will reach a T-intersection.",
        "Walk straight along the corridor for about 12 meters. The reception desk will be on your right.",
    ),
    (
        2, 3, 2,
        "At the intersection, turn right. Room 101 is the first door on your right, about 6 meters ahead. Watch for a small step at the doorway.",
        "Exit Room 101 and turn left. Walk about 6 meters to reach the hallway intersection.",
    ),
    (
        0, 2, 5,
        "Walk straight through the lobby and continue down the long corridor for about 20 meters. Follow the tactile strip to reach the hallway intersection.",
        "Walk the full corridor straight back about 20 meters to reach the main entrance.",
    ),
]

# Build adjacency list with instruction data
GRAPH = {nid: [] for nid in NODES}
for a, b, w, fwd_inst, rev_inst in EDGES:
    GRAPH[a].append((b, w, fwd_inst))
    GRAPH[b].append((a, w, rev_inst))


def manhattan_heuristic(node_id, goal_id):
    """Manhattan distance heuristic for A*."""
    x1, y1 = NODES[node_id]["pos"]
    x2, y2 = NODES[goal_id]["pos"]
    return abs(x1 - x2) + abs(y1 - y2)


def astar(start_id, goal_id):
    """
    A* search from start_id to goal_id.
    Returns (path, cost) where path is a list of node IDs, or (None, None) if no path.
    """
    if start_id not in NODES or goal_id not in NODES:
        return None, None

    open_set = [(0, start_id)]
    came_from = {}
    g_score = {nid: float("inf") for nid in NODES}
    g_score[start_id] = 0

    while open_set:
        _, current = heapq.heappop(open_set)

        if current == goal_id:
            path = []
            while current in came_from:
                path.append(current)
                current = came_from[current]
            path.append(start_id)
            path.reverse()
            return path, g_score[goal_id]

        for neighbor, weight, _ in GRAPH.get(current, []):
            tentative = g_score[current] + weight
            if tentative < g_score[neighbor]:
                came_from[neighbor] = current
                g_score[neighbor] = tentative
                f_score = tentative + manhattan_heuristic(neighbor, goal_id)
                heapq.heappush(open_set, (f_score, neighbor))

    return None, None


def _get_edge_instruction(from_id, to_id):
    """Get the walking instruction for traveling from from_id to to_id."""
    for neighbor, _, instruction in GRAPH.get(from_id, []):
        if neighbor == to_id:
            return instruction
    return None


def get_navigation_instruction(current_marker_id, goal_marker_id=3):
    """
    Given the current ArUco marker ID and a goal, return rich navigation info
    including room details, step-by-step instructions, and environment context.
    Default goal is Room-101 (marker 3) for the demo.
    """
    if current_marker_id not in NODES:
        return None

    current_node = NODES[current_marker_id]

    if current_marker_id == goal_marker_id:
        return {
            "current_location": current_node["name"],
            "next_waypoint": None,
            "instruction": "You have arrived at your destination.",
            "step_instruction": f"You have reached {current_node['name']}. {current_node['description']}.",
            "full_path": [current_node["name"]],
            "environment": {
                "description": current_node["description"],
                "floor": current_node["floor"],
                "landmarks": current_node["landmarks"],
                "hazards": current_node["hazards"],
                "dimensions": current_node["dimensions"],
            },
        }

    path, cost = astar(current_marker_id, goal_marker_id)
    if path is None:
        return None

    next_node_id = path[1] if len(path) > 1 else path[0]
    next_node = NODES[next_node_id]

    # Get detailed walking instruction for this specific edge
    step_instruction = _get_edge_instruction(current_marker_id, next_node_id)
    if not step_instruction:
        step_instruction = f"Proceed toward {next_node['name']}."

    # Build remaining steps summary
    remaining_steps = []
    for i in range(len(path) - 1):
        inst = _get_edge_instruction(path[i], path[i + 1])
        remaining_steps.append({
            "from": NODES[path[i]]["name"],
            "to": NODES[path[i + 1]]["name"],
            "instruction": inst,
        })

    return {
        "current_location": current_node["name"],
        "next_waypoint": next_node["name"],
        "instruction": step_instruction,
        "step_instruction": step_instruction,
        "full_path": [NODES[nid]["name"] for nid in path],
        "remaining_steps": remaining_steps,
        "steps_remaining": len(path) - 1,
        "environment": {
            "description": current_node["description"],
            "floor": current_node["floor"],
            "landmarks": current_node["landmarks"],
            "hazards": current_node["hazards"],
            "dimensions": current_node["dimensions"],
        },
    }
