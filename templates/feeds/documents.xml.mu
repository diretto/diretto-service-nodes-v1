<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
	<generator uri="http://dev.diretto.org" version="{{serverver}}">{{server}}</generator>
	<link rel="self" href="{{self}}" />
	<link rel="alternate" href="{{website}}" />
	{{#hasNext}}<link rel="next" href="{{next}}" />{{/hasNext}}
	{{#hasPrevious}}<link rel="previous" href="{{previous}}" />{{/hasPrevious}}
	<link rel="hub" href="{{hub}}" />
	<title>{{title}} - Document Feed</title>
	<id>{{id}}</id>
	<updated>{{updated}}</updated>
	
{{#entries}}
	 <entry>
		<author>
			<name>{{user}}</name>		
			<uri>{{useruri}}</uri>
		</author>
		<id>urn:diretto-org:document:{{id}}</id>
		<title>Document {{id}}</title>
		<link rel="alternate" href="{{docuri}}"></link>
		<updated>{{date}}</updated>
		<category term="{{category}}" />
	 </entry>    
 {{/entries}}
 
</feed>