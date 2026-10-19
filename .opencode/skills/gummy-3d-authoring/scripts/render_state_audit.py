"""Read-only render/visibility and material-slot audit. Import in Blender."""
import bpy


def _render_states():
    """Map each collection to whether it, or any parent, is hidden from rendering."""
    states = {}
    stack = [(bpy.context.view_layer.layer_collection, False)]
    while stack:
        layer, parent_hidden = stack.pop()
        hidden = parent_hidden or layer.collection.hide_render
        states[layer.collection] = hidden
        stack.extend((child, hidden) for child in layer.children)
    return states


def run(objects=None):
    """Report state only; never changes visibility, slots or selection.

    objects: explicit mesh object names, or None for every mesh in the file.
    """
    if objects is None:
        targets = [ob for ob in bpy.data.objects if ob.type == 'MESH']
    else:
        if not objects:
            raise ValueError('Pass object names or omit the argument for every mesh')
        targets = [bpy.data.objects[name] for name in objects]
        if any(ob.type != 'MESH' for ob in targets):
            raise ValueError('All targets must be meshes')

    view_layer_names = {ob.name for ob in bpy.context.view_layer.objects}
    checked = [ob for ob in targets if ob.name in view_layer_names]
    not_in_view_layer = sorted(ob.name for ob in targets if ob.name not in view_layer_names)
    render_states = _render_states()

    hidden_but_rendered = []
    rendered_but_hidden = []
    without_slots = []
    empty_slots = []
    object_linked = []
    meshes = {}
    materials = {}

    for ob in checked:
        renderable = not (ob.hide_render or any(render_states.get(c, False)
                                                for c in ob.users_collection))
        visible = ob.visible_get()
        if renderable and not visible:
            hidden_but_rendered.append(ob.name)
        elif visible and not renderable:
            rendered_but_hidden.append(ob.name)

        slots = ob.material_slots
        if not len(slots):
            without_slots.append(ob.name)
        for index, slot in enumerate(slots):
            if slot.link == 'OBJECT':
                object_linked.append({'object': ob.name, 'slot': index})
            if slot.material is None:
                empty_slots.append({'object': ob.name, 'slot': index, 'link': slot.link})
            else:
                materials.setdefault(slot.material.name, set()).add(ob.name)

        data = ob.data
        if data.users > 1 and data.name not in meshes:
            meshes[data.name] = {'mesh': data.name, 'users': data.users,
                                 'objects': sorted(o.name for o in bpy.data.objects
                                                   if o.type == 'MESH' and o.data is data)}

    shared_meshes = [meshes[name] for name in sorted(meshes)]
    shared_materials = [{'material': name, 'objects': sorted(users)}
                        for name, users in sorted(materials.items()) if len(users) > 1]
    return {
        'objects_checked': len(checked),
        'renderable_but_viewport_hidden': sorted(hidden_but_rendered),
        'viewport_visible_but_render_hidden': sorted(rendered_but_hidden),
        'mesh_without_material_slots': sorted(without_slots),
        'slots_without_material': empty_slots,
        'object_linked_material_slots': object_linked,
        'shared_meshes': shared_meshes,
        'materials_used_by_multiple_objects': shared_materials,
        'not_in_view_layer': not_in_view_layer,
        'counts': {
            'renderable_but_viewport_hidden': len(hidden_but_rendered),
            'viewport_visible_but_render_hidden': len(rendered_but_hidden),
            'mesh_without_material_slots': len(without_slots),
            'slots_without_material': len(empty_slots),
            'object_linked_material_slots': len(object_linked),
            'shared_meshes': len(shared_meshes),
        },
        'unverified': [
            'whether a viewport-hidden but renderable object is intentional '
            '(reference planes, datums, superseded sources)',
            'whether an object without material slots is meant to be untextured',
            'rendered appearance, shader correctness and image texture paths',
            'material users outside the checked objects, linked libraries and overrides',
        ],
        'note': 'Viewport visibility is Object.visible_get(); hide_render and collection '
                'hide_render decide rendering. hide_set and hide_viewport are viewport-only.',
    }
