Hackathon:
	+-------------+----------------------+--------+----------+----------+---------+---------------+-----------+------------------------------+------------+---------+
	| Field       | Type                 | Unique | Optional | Nillable | Default | UpdateDefault | Immutable | StructTag                    | Validators | Comment |
	+-------------+----------------------+--------+----------+----------+---------+---------------+-----------+------------------------------+------------+---------+
	| id          | int                  | false  | false    | false    | false   | false         | false     | json:"id,omitempty"          |          0 |         |
	| name        | string               | true   | false    | false    | false   | false         | false     | json:"name,omitempty"        |          1 |         |
	| start_date  | time.Time            | false  | true     | true     | false   | false         | false     | json:"start_date,omitempty"  |          0 |         |
	| end_date    | time.Time            | false  | true     | true     | false   | false         | false     | json:"end_date,omitempty"    |          0 |         |
	| created_at  | time.Time            | false  | false    | false    | true    | false         | true      | json:"created_at,omitempty"  |          0 |         |
	| modified_at | time.Time            | false  | false    | false    | true    | true          | false     | json:"modified_at,omitempty" |          0 |         |
	| visibility  | hackathon.Visibility | false  | false    | false    | false   | false         | false     | json:"visibility,omitempty"  |          0 |         |
	| description | string               | false  | true     | false    | false   | false         | false     | json:"description,omitempty" |          0 |         |
	| logo        | string               | false  | true     | false    | false   | false         | false     | json:"logo,omitempty"        |          0 |         |
	+-------------+----------------------+--------+----------+----------+---------+---------------+-----------+------------------------------+------------+---------+
	+---------------------+-------------+---------+----------------------------+----------+--------+----------+---------+
	| Edge                | Type        | Inverse | BackRef                    | Relation | Unique | Optional | Comment |
	+---------------------+-------------+---------+----------------------------+----------+--------+----------+---------+
	| tracks              | Track       | false   |                            | O2M      | false  | true     |         |
	| projects            | Project     | false   |                            | O2M      | false  | true     |         |
	| participating_users | User        | true    | participates_in_hackathons | M2M      | false  | true     |         |
	| pages               | Page        | false   |                            | O2M      | false  | true     |         |
	| phases              | Phase       | false   |                            | O2M      | false  | true     |         |
	| creator             | User        | true    | created_hackathons         | M2O      | true   | false    |         |
	| modifier            | User        | true    | modified_hackathons        | M2O      | true   | true     |         |
	| participants        | Participant | true    | hackathon                  | O2M      | false  | true     |         |
	+---------------------+-------------+---------+----------------------------+----------+--------+----------+---------+
	
Page:
	+-------------+-----------+--------+----------+----------+---------+---------------+-----------+------------------------------+------------+---------+
	| Field       | Type      | Unique | Optional | Nillable | Default | UpdateDefault | Immutable | StructTag                    | Validators | Comment |
	+-------------+-----------+--------+----------+----------+---------+---------------+-----------+------------------------------+------------+---------+
	| id          | int       | false  | false    | false    | false   | false         | false     | json:"id,omitempty"          |          0 |         |
	| title       | string    | false  | false    | false    | false   | false         | false     | json:"title,omitempty"       |          1 |         |
	| content     | string    | false  | false    | false    | false   | false         | false     | json:"content,omitempty"     |          0 |         |
	| visible     | bool      | false  | false    | false    | true    | false         | false     | json:"visible,omitempty"     |          0 |         |
	| order       | int       | false  | false    | false    | false   | false         | false     | json:"order,omitempty"       |          0 |         |
	| created_at  | time.Time | false  | false    | false    | true    | false         | true      | json:"created_at,omitempty"  |          0 |         |
	| modified_at | time.Time | false  | false    | false    | true    | true          | false     | json:"modified_at,omitempty" |          0 |         |
	+-------------+-----------+--------+----------+----------+---------+---------------+-----------+------------------------------+------------+---------+
	+-----------+-----------+---------+----------------+----------+--------+----------+---------+
	| Edge      | Type      | Inverse | BackRef        | Relation | Unique | Optional | Comment |
	+-----------+-----------+---------+----------------+----------+--------+----------+---------+
	| hackathon | Hackathon | true    | pages          | M2O      | true   | false    |         |
	| phase     | Phase     | true    | page           | O2O      | true   | true     |         |
	| creator   | User      | true    | created_pages  | M2O      | true   | false    |         |
	| modifier  | User      | true    | modified_pages | M2O      | true   | true     |         |
	+-----------+-----------+---------+----------------+----------+--------+----------+---------+
	
Participant:
	+--------------+-----------+--------+----------+----------+---------+---------------+-----------+-------------------------------+------------+---------+
	| Field        | Type      | Unique | Optional | Nillable | Default | UpdateDefault | Immutable | StructTag                     | Validators | Comment |
	+--------------+-----------+--------+----------+----------+---------+---------------+-----------+-------------------------------+------------+---------+
	| hackathon_id | int       | false  | false    | false    | false   | false         | false     | json:"hackathon_id,omitempty" |          0 |         |
	| user_id      | int       | false  | false    | false    | false   | false         | false     | json:"user_id,omitempty"      |          0 |         |
	| is_waiting   | bool      | false  | false    | false    | true    | false         | false     | json:"is_waiting,omitempty"   |          0 |         |
	| created_at   | time.Time | false  | false    | false    | true    | false         | true      | json:"created_at,omitempty"   |          0 |         |
	+--------------+-----------+--------+----------+----------+---------+---------------+-----------+-------------------------------+------------+---------+
	+-----------+-----------+---------+---------+----------+--------+----------+---------+
	| Edge      | Type      | Inverse | BackRef | Relation | Unique | Optional | Comment |
	+-----------+-----------+---------+---------+----------+--------+----------+---------+
	| hackathon | Hackathon | false   |         | M2O      | true   | false    |         |
	| user      | User      | false   |         | M2O      | true   | false    |         |
	+-----------+-----------+---------+---------+----------+--------+----------+---------+
	
Phase:
	+-------------+-----------+--------+----------+----------+---------+---------------+-----------+------------------------------+------------+---------+
	| Field       | Type      | Unique | Optional | Nillable | Default | UpdateDefault | Immutable | StructTag                    | Validators | Comment |
	+-------------+-----------+--------+----------+----------+---------+---------------+-----------+------------------------------+------------+---------+
	| id          | int       | false  | false    | false    | false   | false         | false     | json:"id,omitempty"          |          0 |         |
	| start_date  | time.Time | false  | true     | true     | false   | false         | false     | json:"start_date,omitempty"  |          0 |         |
	| end_date    | time.Time | false  | true     | true     | false   | false         | false     | json:"end_date,omitempty"    |          0 |         |
	| name        | string    | false  | false    | false    | false   | false         | false     | json:"name,omitempty"        |          1 |         |
	| description | string    | false  | true     | false    | false   | false         | false     | json:"description,omitempty" |          0 |         |
	| created_at  | time.Time | false  | false    | false    | true    | false         | true      | json:"created_at,omitempty"  |          0 |         |
	| modified_at | time.Time | false  | false    | false    | true    | true          | false     | json:"modified_at,omitempty" |          0 |         |
	+-------------+-----------+--------+----------+----------+---------+---------------+-----------+------------------------------+------------+---------+
	+-----------+-----------+---------+-----------------+----------+--------+----------+---------+
	| Edge      | Type      | Inverse | BackRef         | Relation | Unique | Optional | Comment |
	+-----------+-----------+---------+-----------------+----------+--------+----------+---------+
	| hackathon | Hackathon | true    | phases          | M2O      | true   | false    |         |
	| page      | Page      | false   |                 | O2O      | true   | true     |         |
	| creator   | User      | true    | created_phases  | M2O      | true   | false    |         |
	| modifier  | User      | true    | modified_phases | M2O      | true   | true     |         |
	+-----------+-----------+---------+-----------------+----------+--------+----------+---------+
	
Project:
	+-------------+----------------+--------+----------+----------+---------+---------------+-----------+------------------------------+------------+---------+
	| Field       | Type           | Unique | Optional | Nillable | Default | UpdateDefault | Immutable | StructTag                    | Validators | Comment |
	+-------------+----------------+--------+----------+----------+---------+---------------+-----------+------------------------------+------------+---------+
	| id          | int            | false  | false    | false    | false   | false         | false     | json:"id,omitempty"          |          0 |         |
	| title       | string         | false  | false    | false    | false   | false         | false     | json:"title,omitempty"       |          1 |         |
	| created_at  | time.Time      | false  | false    | false    | true    | false         | true      | json:"created_at,omitempty"  |          0 |         |
	| modified_at | time.Time      | false  | false    | false    | true    | true          | false     | json:"modified_at,omitempty" |          0 |         |
	| status      | project.Status | false  | false    | false    | false   | false         | false     | json:"status,omitempty"      |          0 |         |
	| image       | string         | false  | true     | false    | false   | false         | false     | json:"image,omitempty"       |          0 |         |
	| description | string         | false  | false    | false    | false   | false         | false     | json:"description,omitempty" |          0 |         |
	+-------------+----------------+--------+----------+----------+---------+---------------+-----------+------------------------------+------------+---------+
	+--------------------+------------+---------+--------------------+----------+--------+----------+---------+
	| Edge               | Type       | Inverse | BackRef            | Relation | Unique | Optional | Comment |
	+--------------------+------------+---------+--------------------+----------+--------+----------+---------+
	| track              | Track      | true    | projects           | M2O      | true   | false    |         |
	| hackathon          | Hackathon  | true    | projects           | M2O      | true   | false    |         |
	| creator            | User       | true    | created_projects   | M2O      | true   | false    |         |
	| modifier           | User       | true    | modified_projects  | M2O      | true   | true     |         |
	| teams              | Team       | false   |                    | O2M      | false  | true     |         |
	| submissions        | Submission | false   |                    | O2M      | false  | true     |         |
	| preferred_by_users | User       | true    | preferred_projects | M2M      | false  | true     |         |
	+--------------------+------------+---------+--------------------+----------+--------+----------+---------+
	
Submission:
	+-------------+-------------------+--------+----------+----------+---------+---------------+-----------+------------------------------+------------+---------+
	| Field       | Type              | Unique | Optional | Nillable | Default | UpdateDefault | Immutable | StructTag                    | Validators | Comment |
	+-------------+-------------------+--------+----------+----------+---------+---------------+-----------+------------------------------+------------+---------+
	| id          | int               | false  | false    | false    | false   | false         | false     | json:"id,omitempty"          |          0 |         |
	| created_at  | time.Time         | false  | false    | false    | true    | false         | true      | json:"created_at,omitempty"  |          0 |         |
	| modified_at | time.Time         | false  | false    | false    | true    | true          | false     | json:"modified_at,omitempty" |          0 |         |
	| result      | string            | false  | true     | false    | false   | false         | false     | json:"result,omitempty"      |          0 |         |
	| status      | submission.Status | false  | false    | false    | false   | false         | false     | json:"status,omitempty"      |          0 |         |
	| version     | int               | false  | false    | false    | false   | false         | false     | json:"version,omitempty"     |          1 |         |
	+-------------+-------------------+--------+----------+----------+---------+---------------+-----------+------------------------------+------------+---------+
	+----------+---------+---------+----------------------+----------+--------+----------+---------+
	| Edge     | Type    | Inverse | BackRef              | Relation | Unique | Optional | Comment |
	+----------+---------+---------+----------------------+----------+--------+----------+---------+
	| team     | Team    | true    | submissions          | M2O      | true   | false    |         |
	| project  | Project | true    | submissions          | M2O      | true   | false    |         |
	| creator  | User    | true    | created_submissions  | M2O      | true   | false    |         |
	| modifier | User    | true    | modified_submissions | M2O      | true   | true     |         |
	+----------+---------+---------+----------------------+----------+--------+----------+---------+
	
Team:
	+-------------+-----------+--------+----------+----------+---------+---------------+-----------+------------------------------+------------+---------+
	| Field       | Type      | Unique | Optional | Nillable | Default | UpdateDefault | Immutable | StructTag                    | Validators | Comment |
	+-------------+-----------+--------+----------+----------+---------+---------------+-----------+------------------------------+------------+---------+
	| id          | int       | false  | false    | false    | false   | false         | false     | json:"id,omitempty"          |          0 |         |
	| name        | string    | false  | false    | false    | false   | false         | false     | json:"name,omitempty"        |          1 |         |
	| created_at  | time.Time | false  | false    | false    | true    | false         | true      | json:"created_at,omitempty"  |          0 |         |
	| modified_at | time.Time | false  | false    | false    | true    | true          | false     | json:"modified_at,omitempty" |          0 |         |
	| description | string    | false  | true     | false    | false   | false         | false     | json:"description,omitempty" |          0 |         |
	+-------------+-----------+--------+----------+----------+---------+---------------+-----------+------------------------------+------------+---------+
	+-------------------+-----------------+---------+-----------------------+----------+--------+----------+---------+
	| Edge              | Type            | Inverse | BackRef               | Relation | Unique | Optional | Comment |
	+-------------------+-----------------+---------+-----------------------+----------+--------+----------+---------+
	| project           | Project         | true    | teams                 | M2O      | true   | false    |         |
	| creator           | User            | true    | created_teams         | M2O      | true   | false    |         |
	| modifier          | User            | true    | modified_teams        | M2O      | true   | true     |         |
	| submissions       | Submission      | false   |                       | O2M      | false  | true     |         |
	| members           | User            | true    | participates_in_teams | M2M      | false  | true     |         |
	| team_participants | TeamParticipant | true    | team                  | O2M      | false  | true     |         |
	+-------------------+-----------------+---------+-----------------------+----------+--------+----------+---------+
	
TeamParticipant:
	+------------+-----------+--------+----------+----------+---------+---------------+-----------+-----------------------------+------------+---------+
	| Field      | Type      | Unique | Optional | Nillable | Default | UpdateDefault | Immutable | StructTag                   | Validators | Comment |
	+------------+-----------+--------+----------+----------+---------+---------------+-----------+-----------------------------+------------+---------+
	| team_id    | int       | false  | false    | false    | false   | false         | false     | json:"team_id,omitempty"    |          0 |         |
	| user_id    | int       | false  | false    | false    | false   | false         | false     | json:"user_id,omitempty"    |          0 |         |
	| created_at | time.Time | false  | false    | false    | true    | false         | true      | json:"created_at,omitempty" |          0 |         |
	+------------+-----------+--------+----------+----------+---------+---------------+-----------+-----------------------------+------------+---------+
	+------+------+---------+---------+----------+--------+----------+---------+
	| Edge | Type | Inverse | BackRef | Relation | Unique | Optional | Comment |
	+------+------+---------+---------+----------+--------+----------+---------+
	| team | Team | false   |         | M2O      | true   | false    |         |
	| user | User | false   |         | M2O      | true   | false    |         |
	+------+------+---------+---------+----------+--------+----------+---------+
	
Track:
	+-------------+-----------+--------+----------+----------+---------+---------------+-----------+------------------------------+------------+---------+
	| Field       | Type      | Unique | Optional | Nillable | Default | UpdateDefault | Immutable | StructTag                    | Validators | Comment |
	+-------------+-----------+--------+----------+----------+---------+---------------+-----------+------------------------------+------------+---------+
	| id          | int       | false  | false    | false    | false   | false         | false     | json:"id,omitempty"          |          0 |         |
	| name        | string    | false  | false    | false    | false   | false         | false     | json:"name,omitempty"        |          1 |         |
	| description | string    | false  | false    | false    | false   | false         | false     | json:"description,omitempty" |          1 |         |
	| created_at  | time.Time | false  | false    | false    | true    | false         | true      | json:"created_at,omitempty"  |          0 |         |
	| modified_at | time.Time | false  | false    | false    | true    | true          | false     | json:"modified_at,omitempty" |          0 |         |
	+-------------+-----------+--------+----------+----------+---------+---------------+-----------+------------------------------+------------+---------+
	+-----------+-----------+---------+---------+----------+--------+----------+---------+
	| Edge      | Type      | Inverse | BackRef | Relation | Unique | Optional | Comment |
	+-----------+-----------+---------+---------+----------+--------+----------+---------+
	| hackathon | Hackathon | true    | tracks  | M2O      | true   | true     |         |
	| projects  | Project   | false   |         | O2M      | false  | true     |         |
	+-----------+-----------+---------+---------+----------+--------+----------+---------+
	
User:
	+--------------+-----------+--------+----------+----------+---------+---------------+-----------+-------------------------------+------------+---------+
	| Field        | Type      | Unique | Optional | Nillable | Default | UpdateDefault | Immutable | StructTag                     | Validators | Comment |
	+--------------+-----------+--------+----------+----------+---------+---------------+-----------+-------------------------------+------------+---------+
	| id           | int       | false  | false    | false    | false   | false         | false     | json:"id,omitempty"           |          0 |         |
	| username     | string    | false  | false    | false    | false   | false         | false     | json:"username,omitempty"     |          0 |         |
	| keycloak_id  | string    | true   | false    | false    | false   | false         | false     | json:"keycloak_id,omitempty"  |          1 |         |
	| display_name | string    | false  | true     | false    | true    | false         | false     | json:"display_name,omitempty" |          0 |         |
	| email        | string    | false  | true     | false    | true    | false         | false     | json:"email,omitempty"        |          0 |         |
	| created_at   | time.Time | false  | false    | false    | true    | false         | true      | json:"created_at,omitempty"   |          0 |         |
	| modified_at  | time.Time | false  | false    | false    | true    | true          | false     | json:"modified_at,omitempty"  |          0 |         |
	+--------------+-----------+--------+----------+----------+---------+---------------+-----------+-------------------------------+------------+---------+
	+----------------------------+-----------------+---------+---------+----------+--------+----------+---------+
	| Edge                       | Type            | Inverse | BackRef | Relation | Unique | Optional | Comment |
	+----------------------------+-----------------+---------+---------+----------+--------+----------+---------+
	| created_hackathons         | Hackathon       | false   |         | O2M      | false  | true     |         |
	| modified_hackathons        | Hackathon       | false   |         | O2M      | false  | true     |         |
	| created_projects           | Project         | false   |         | O2M      | false  | true     |         |
	| modified_projects          | Project         | false   |         | O2M      | false  | true     |         |
	| participates_in_hackathons | Hackathon       | false   |         | M2M      | false  | true     |         |
	| participates_in_teams      | Team            | false   |         | M2M      | false  | true     |         |
	| created_teams              | Team            | false   |         | O2M      | false  | true     |         |
	| modified_teams             | Team            | false   |         | O2M      | false  | true     |         |
	| created_pages              | Page            | false   |         | O2M      | false  | true     |         |
	| modified_pages             | Page            | false   |         | O2M      | false  | true     |         |
	| created_phases             | Phase           | false   |         | O2M      | false  | true     |         |
	| modified_phases            | Phase           | false   |         | O2M      | false  | true     |         |
	| created_submissions        | Submission      | false   |         | O2M      | false  | true     |         |
	| modified_submissions       | Submission      | false   |         | O2M      | false  | true     |         |
	| preferred_projects         | Project         | false   |         | M2M      | false  | true     |         |
	| participations             | Participant     | true    | user    | O2M      | false  | true     |         |
	| team_participations        | TeamParticipant | true    | user    | O2M      | false  | true     |         |
	+----------------------------+-----------------+---------+---------+----------+--------+----------+---------+
	
