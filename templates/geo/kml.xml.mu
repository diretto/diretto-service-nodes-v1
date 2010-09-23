<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
	<name>{{title}} KML Feed - Documents</name>


<Style id="otherStyleHi">
      <IconStyle>
        <Icon>
          <href>http://www.diretto.org/img/other-colored-regular.png</href>
                <w>21</w>
         <h>26</h>
        </Icon>
      </IconStyle>
    </Style>
    <Style id="otherStyleno">
      <IconStyle>
        <Icon>
          <href>http://www.diretto.org/img/other-gray-regular.png</href>
        <w>21</w>
         <h>26</h>
        </Icon>
      </IconStyle>
    </Style>
    <StyleMap id="otherStyle">
      <Pair>
        <key>normal</key>
        <styleUrl>#otherStyleno</styleUrl>
      </Pair>
      <Pair>
        <key>highlight</key>
        <styleUrl>#otherStyleHi</styleUrl>
      </Pair>
    </StyleMap>
    
    <Style id="imageStyleHi">
      <IconStyle>
        <Icon>
          <href>http://www.diretto.org/img/image-colored-regular.png</href>
        <w>21</w>
         <h>26</h>
        </Icon>
      </IconStyle>
    </Style>
    <Style id="imageStyleno">
      <IconStyle>
        <Icon>
          <href>http://www.diretto.org/img/image-gray-regular.png</href>
        <w>21</w>
         <h>26</h>
        </Icon>
      </IconStyle>
    </Style>
    <StyleMap id="imageStyle">
      <Pair>
        <key>normal</key>
        <styleUrl>#imageStyleno</styleUrl>
      </Pair>
      <Pair>
        <key>highlight</key>
        <styleUrl>#imageStyleHi</styleUrl>
      </Pair>
    </StyleMap>

{{#entries}} 
  <Placemark>
    <name>{{id}}</name>
    <styleUrl>#{{type}}Style</styleUrl>
    <description>{{text}}</description>
    
   <Point>
      <coordinates>{{lon}},{{lat}},0</coordinates>
    </Point>
  </Placemark>
{{/entries}}


 </Document>
</kml>
