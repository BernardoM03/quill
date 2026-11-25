# Small helpers shared by the rules modules.

def field_error(field, message):
    return {'field': field, 'message': message}

# A problem that only means something hasn't been filled in yet, rather than that something is wrong.
# The wizard's Complete button saves an unfinished character for later, but sends the player to real errors.
def missing_error(field, message):
    return {'field': field, 'message': message, 'incomplete': True}

# True for an int that isn't a bool, since bool is a subclass of int in Python.
def is_whole_number(value):
    return isinstance(value, int) and not isinstance(value, bool)

def ability_modifier(score):
    return (score - 10) // 2

# A pick as a list: lists pass through, blanks become empty and single values are wrapped.
def picked_values(value):
    return value if isinstance(value, list) else ([] if value in (None, '') else [value])
