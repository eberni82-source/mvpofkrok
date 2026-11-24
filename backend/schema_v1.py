"""Initial relational schema. Frozen for migration 0001; extend with new migrations."""
from sqlalchemy import (MetaData, Table, Column, Integer, String, Text, Float, JSON,
                        ForeignKey, ForeignKeyConstraint, UniqueConstraint, CheckConstraint, Index)
metadata = MetaData()
users = Table('users', metadata,
    Column('id', Integer, primary_key=True), Column('username', String(80), nullable=False, unique=True),
    Column('hash', Text, nullable=False), Column('salt', String(32), nullable=False),
    Column('role', String(10), nullable=False), Column('active', Integer, nullable=False, server_default='1'),
    CheckConstraint("role IN ('reader','editor','admin')", name='user_role'),
    CheckConstraint('active IN (0,1)', name='user_active'))
sessions = Table('sessions', metadata,
    Column('token', String(64), primary_key=True),
    Column('user_id', Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
    Column('csrf', String(100), nullable=False), Column('expires', Float, nullable=False, index=True))
workspace = Table('workspace', metadata,
    Column('id', Integer, primary_key=True), Column('revision', Integer, nullable=False),
    Column('has_deals', Integer, nullable=False, server_default='0'),
    CheckConstraint('id=1 AND revision>=0', name='single_workspace'))
audit = Table('audit', metadata,
    Column('id', Integer, primary_key=True), Column('at', Float, nullable=False),
    Column('user_id', Integer, ForeignKey('users.id'), index=True),
    Column('action', String(80), nullable=False), Column('revision', Integer))
companies = Table('companies', metadata, Column('id', String(100), primary_key=True),
    Column('name', Text, nullable=False), Column('ordinal', Integer, nullable=False), Column('payload', JSON, nullable=False))
people = Table('people', metadata, Column('id', String(100), primary_key=True),
    Column('company_id', String(100), ForeignKey('companies.id'), nullable=False, index=True),
    Column('name', Text, nullable=False), Column('role', String(40), nullable=False),
    Column('influence', String(12), nullable=False), Column('attitude', String(12), nullable=False),
    Column('ordinal', Integer, nullable=False), Column('payload', JSON, nullable=False),
    UniqueConstraint('company_id','id', name='person_company_id'),
    CheckConstraint("influence IN ('high','medium','low','unknown')", name='person_influence'),
    CheckConstraint("attitude IN ('positive','neutral','skeptical','unknown')", name='person_attitude'))
relations = Table('relations', metadata, Column('id', String(100), primary_key=True),
    Column('company_id', String(100), ForeignKey('companies.id'), nullable=False, index=True),
    Column('source', String(100), nullable=False, index=True), Column('target', String(100), nullable=False, index=True),
    Column('kind', String(20), nullable=False), Column('ordinal', Integer, nullable=False), Column('payload', JSON, nullable=False),
    ForeignKeyConstraint(['company_id','source'], ['people.company_id','people.id']),
    ForeignKeyConstraint(['company_id','target'], ['people.company_id','people.id']),
    UniqueConstraint('source','target','kind', name='unique_relation'),
    CheckConstraint('source<>target', name='different_people'),
    CheckConstraint("kind IN ('reports_to','influences','works_with')", name='relation_kind'))
interactions = Table('interactions', metadata, Column('id', String(100), primary_key=True),
    Column('company_id', String(100), ForeignKey('companies.id'), nullable=False, index=True),
    Column('person_id', String(100), nullable=False, index=True), Column('date', String(10), nullable=False),
    Column('ordinal', Integer, nullable=False), Column('payload', JSON, nullable=False),
    UniqueConstraint('company_id','id', name='interaction_company_id'),
    ForeignKeyConstraint(['company_id','person_id'], ['people.company_id','people.id']))
Index('interaction_company_date', interactions.c.company_id, interactions.c.date)
deals = Table('deals', metadata, Column('id', String(100), primary_key=True),
    Column('company_id', String(100), ForeignKey('companies.id'), nullable=False, index=True),
    Column('name', Text, nullable=False), Column('ordinal', Integer, nullable=False), Column('payload', JSON, nullable=False),
    UniqueConstraint('company_id','id', name='deal_company_id'))
committee = Table('committee', metadata, Column('ordinal', Integer, primary_key=True),
    Column('company_id', String(100), ForeignKey('companies.id'), nullable=False, index=True),
    Column('person_id', String(100), index=True), Column('payload', JSON, nullable=False),
    ForeignKeyConstraint(['company_id','person_id'], ['people.company_id','people.id']))
def participants(name, parent):
    return Table(name, metadata,
        Column('parent_id', String(100), primary_key=True), Column('person_id', String(100), primary_key=True),
        Column('company_id', String(100), nullable=False, index=True),
        ForeignKeyConstraint(['company_id','parent_id'], [parent+'.company_id',parent+'.id']),
        ForeignKeyConstraint(['company_id','person_id'], ['people.company_id','people.id']))
interaction_people=participants('interaction_participants','interactions')
deal_people=participants('deal_participants','deals')
Index('interaction_participant_person', interaction_people.c.person_id)
Index('deal_participant_person', deal_people.c.person_id)
